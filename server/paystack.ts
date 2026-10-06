import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import { sellableById } from '../src/config/premium';
import { readBody, send } from './saves';

/** The part of a Paystack transaction we read (from verify, or from a charge.success webhook). */
export type PaystackTxn = {
  status: string;
  reference: string;
  /** In kobo. */
  amount: number;
  currency: string;
  metadata?: { userId?: unknown; pack?: unknown } | null;
};

export interface PaystackApi {
  initialize(p: { email: string; amountKobo: number; reference: string; callbackUrl: string; metadata: { userId: string; pack: string } }): Promise<{ authorization_url: string; reference: string }>;
  /** The transaction for a reference, or null if Paystack does not know it. */
  verify(reference: string): Promise<PaystackTxn | null>;
}

const API = 'https://api.paystack.co';

export function createPaystackApi(secretKey: string, doFetch: typeof fetch = fetch): PaystackApi {
  const headers = { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' };
  return {
    async initialize({ email, amountKobo, reference, callbackUrl, metadata }) {
      const res = await doFetch(`${API}/transaction/initialize`, {
        method: 'POST', headers,
        body: JSON.stringify({ email, amount: amountKobo, currency: 'NGN', reference, callback_url: callbackUrl, metadata }),
      });
      const body = await res.json().catch(() => null) as { status?: boolean; data?: { authorization_url?: string; reference?: string } } | null;
      if (!res.ok || !body?.status || !body.data?.authorization_url) throw new Error(`paystack initialize failed (${res.status})`);
      return { authorization_url: body.data.authorization_url, reference: body.data.reference ?? reference };
    },
    async verify(reference) {
      const res = await doFetch(`${API}/transaction/verify/${encodeURIComponent(reference)}`, { headers });
      if (res.status === 404) return null;
      const body = await res.json().catch(() => null) as { status?: boolean; data?: PaystackTxn } | null;
      if (!res.ok) throw new Error(`paystack verify failed (${res.status})`);
      return body?.status && body.data ? body.data : null;
    },
  };
}

export type Purchase = { reference: string; userId: string; packId: string; gems: number; coins: number; amountKobo: number };

/** Everything a buyer has ever bought: Gems, and in-game naira ("coins"). */
export type Totals = { gems: number; coins: number };

export interface PurchaseStore {
  /** Records a paid purchase once per reference. True only for the call that recorded it. */
  credit(p: Purchase): Promise<boolean>;
  /** Every Gem and every coin this user has ever bought. */
  totals(userId: string): Promise<Totals>;
}

export class MemoryPurchaseStore implements PurchaseStore {
  private rows = new Map<string, Purchase>();
  async credit(p: Purchase) {
    if (this.rows.has(p.reference)) return false;
    this.rows.set(p.reference, p);
    return true;
  }
  async totals(userId: string) {
    const sum = { gems: 0, coins: 0 };
    for (const p of this.rows.values()) if (p.userId === userId) { sum.gems += p.gems; sum.coins += p.coins; }
    return sum;
  }
}

export class PgPurchaseStore implements PurchaseStore {
  constructor(private pool: Pool) {}

  async ensureSchema() {
    await this.pool.query(`create table if not exists gem_purchases (
      reference text primary key, user_id text not null, pack_id text not null, gems integer not null,
      amount_kobo integer not null, created_at timestamptz not null default now())`);
    await this.pool.query('create index if not exists gem_purchases_user on gem_purchases (user_id)');
    // In-game naira packs share the table: a row adds Gems, coins, or (one day) both.
    await this.pool.query('alter table gem_purchases add column if not exists coins bigint not null default 0');
  }

  async credit(p: Purchase) {
    const r = await this.pool.query(
      'insert into gem_purchases (reference, user_id, pack_id, gems, coins, amount_kobo) values ($1, $2, $3, $4, $5, $6) on conflict do nothing returning reference',
      [p.reference, p.userId, p.packId, p.gems, p.coins, p.amountKobo]);
    return r.rows.length > 0;
  }

  async totals(userId: string) {
    const r = await this.pool.query(
      'select coalesce(sum(gems), 0)::float8 as gems, coalesce(sum(coins), 0)::float8 as coins from gem_purchases where user_id = $1', [userId]);
    return { gems: r.rows[0].gems as number, coins: r.rows[0].coins as number };
  }
}

export type PayDeps = {
  store: PurchaseStore | null;
  /** Null until PAYSTACK_SECRET_KEY is set. */
  paystack: PaystackApi | null;
  /** The webhook's HMAC key (the same secret key); null refuses every webhook. */
  secretKey: string | null;
  allowedOrigins: string[];
};

export type Settled = 'credited' | 'already' | 'pending' | 'failed' | 'invalid';

/**
 * Credits a Paystack transaction to the player named in its metadata, once. The price and the Gems
 * come from our own pack table, so a payment only counts if it matches that pack exactly.
 * With `expectUser`, a transaction that belongs to someone else is refused.
 */
export async function settle(store: PurchaseStore, txn: PaystackTxn, expectUser?: string): Promise<Settled> {
  if (txn.status !== 'success') return txn.status === 'failed' || txn.status === 'abandoned' || txn.status === 'reversed' ? 'failed' : 'pending';
  const pack = sellableById(txn.metadata?.pack);
  const userId = txn.metadata?.userId;
  if (!pack || typeof userId !== 'string' || !userId) return 'invalid';
  if (expectUser !== undefined && userId !== expectUser) return 'invalid';
  if (txn.currency !== 'NGN' || txn.amount !== pack.naira * 100) return 'invalid';
  const fresh = await store.credit({ reference: txn.reference, userId, packId: pack.id, gems: pack.gems, coins: pack.coins, amountKobo: txn.amount });
  return fresh ? 'credited' : 'already';
}

const DEVICE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Who is buying. There are no accounts yet, so a purchase belongs to the random id the phone made for itself
 * (sent as X-Device-Id). Only that phone knows it; once accounts exist, purchases can be moved to one.
 */
const buyerOf = (req: IncomingMessage): string | null => {
  const id = req.headers['x-device-id'];
  return typeof id === 'string' && DEVICE_ID.test(id) ? `device:${id.toLowerCase()}` : null;
};

const validSignature = (secret: string, raw: string, header: string | string[] | undefined) => {
  if (typeof header !== 'string') return false;
  const want = Buffer.from(createHmac('sha512', secret).update(raw).digest('hex'));
  const got = Buffer.from(header);
  return got.length === want.length && timingSafeEqual(got, want);
};

/** Where Paystack sends the player back to: the page that asked, if it is one of ours, else our first origin. */
const callbackFor = (req: IncomingMessage, allowed: string[]) => {
  const origin = req.headers.origin;
  const site = origin && allowed.includes(origin) ? origin : allowed.find(o => o.startsWith('https://')) ?? allowed[0];
  return `${site}/`;
};

export async function handlePayRequest(req: IncomingMessage, res: ServerResponse, deps: PayDeps): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://x');
  const path = url.pathname;
  const origin = req.headers.origin;
  if (origin && deps.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'X-Device-Id, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') return send(res, 204);
  if (!deps.store) return send(res, 503);

  if (path === '/pay/webhook') {
    if (req.method !== 'POST') return send(res, 405);
    if (!deps.secretKey) return send(res, 503);
    const raw = await readBody(req);
    if (raw === null) return send(res, 413);
    // Anyone can post here, so nothing is read until the signature proves it came from Paystack.
    if (!validSignature(deps.secretKey, raw, req.headers['x-paystack-signature'])) return send(res, 401);
    let event: { event?: unknown; data?: PaystackTxn };
    try { event = JSON.parse(raw); } catch { return send(res, 400); }
    if (event.event === 'charge.success' && event.data) {
      const outcome = await settle(deps.store, event.data);
      if (outcome === 'invalid') console.warn(`paystack webhook ${event.data.reference}: does not match a pack, not credited`);
    }
    return send(res, 200);
  }

  const userId = buyerOf(req);
  if (!userId) return send(res, 401);

  if (path === '/pay/total') {
    if (req.method !== 'GET') return send(res, 405);
    const t = await deps.store.totals(userId);
    return send(res, 200, { total: t.gems, coins: t.coins });
  }

  if (path === '/pay/verify') {
    if (req.method !== 'GET') return send(res, 405);
    if (!deps.paystack) return send(res, 503);
    const reference = url.searchParams.get('reference');
    if (!reference || reference.length > 100) return send(res, 400);
    const txn = await deps.paystack.verify(reference);
    if (!txn) return send(res, 404);
    const status = await settle(deps.store, txn, userId);
    const t = await deps.store.totals(userId);
    return send(res, 200, { status, total: t.gems, coins: t.coins });
  }

  if (path === '/pay/init') {
    if (req.method !== 'POST') return send(res, 405);
    if (!deps.paystack) return send(res, 503);
    const text = await readBody(req);
    if (text === null) return send(res, 413);
    let body: { pack?: unknown; email?: unknown };
    try { body = JSON.parse(text); } catch { return send(res, 400); }
    const pack = sellableById(body?.pack);
    if (!pack) return send(res, 400);
    // Paystack needs an email on every payment; it is where their receipt goes.
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    if (email.length > 120 || !EMAIL.test(email)) return send(res, 400, { error: 'email' });
    const reference = `lr_${randomUUID().replace(/-/g, '')}`;
    const started = await deps.paystack.initialize({
      email, amountKobo: pack.naira * 100, reference, callbackUrl: callbackFor(req, deps.allowedOrigins), metadata: { userId, pack: pack.id },
    });
    return send(res, 200, { url: started.authorization_url, reference: started.reference });
  }

  return send(res, 404);
}
