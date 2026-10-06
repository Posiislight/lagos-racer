import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import { normaliseSynced, type SyncedSave } from '../src/game/syncSave';

export type StoredSave = { data: SyncedSave; rev: number };
export type PutResult = { ok: true; rev: number } | { ok: false; current: StoredSave | null };

export interface SaveStore {
  get(userId: string): Promise<StoredSave | null>;
  /** Writes only if the stored revision is still expectedRev (0 means no save yet). */
  putIfRev(userId: string, data: SyncedSave, expectedRev: number): Promise<PutResult>;
}

export class MemorySaveStore implements SaveStore {
  private rows = new Map<string, StoredSave>();
  async get(userId: string) { return this.rows.get(userId) ?? null; }
  async putIfRev(userId: string, data: SyncedSave, expectedRev: number): Promise<PutResult> {
    const cur = this.rows.get(userId) ?? null;
    if ((cur?.rev ?? 0) !== expectedRev) return { ok: false, current: cur };
    const rev = expectedRev + 1;
    this.rows.set(userId, { data, rev });
    return { ok: true, rev };
  }
}

export class PgSaveStore implements SaveStore {
  constructor(private pool: Pool) {}

  async ensureSchema() {
    await this.pool.query(`create table if not exists saves (
      user_id text primary key, data jsonb not null, rev integer not null, updated_at timestamptz not null default now())`);
  }

  async get(userId: string): Promise<StoredSave | null> {
    const r = await this.pool.query('select data, rev from saves where user_id = $1', [userId]);
    return r.rows[0] ? { data: normaliseSynced(r.rows[0].data), rev: r.rows[0].rev } : null;
  }

  async putIfRev(userId: string, data: SyncedSave, expectedRev: number): Promise<PutResult> {
    const r = expectedRev === 0
      ? await this.pool.query('insert into saves (user_id, data, rev) values ($1, $2, 1) on conflict do nothing returning rev', [userId, JSON.stringify(data)])
      : await this.pool.query('update saves set data = $2, rev = rev + 1, updated_at = now() where user_id = $1 and rev = $3 returning rev', [userId, JSON.stringify(data), expectedRev]);
    if (r.rows[0]) return { ok: true, rev: r.rows[0].rev };
    return { ok: false, current: await this.get(userId) };
  }
}

export type SaveDeps = {
  store: SaveStore | null;
  /** The Clerk user id behind a session token, or null if it is not valid. */
  verify: (token: string) => Promise<string | null>;
  allowedOrigins: string[];
};

const MAX_BODY = 64 * 1024;

export function send(res: ServerResponse, status: number, body?: unknown) {
  if (body === undefined) return void res.writeHead(status).end();
  res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
}

/** The request body as text, or null once it passes the cap. */
export function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) { resolve(null); chunks.length = 0; return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
    req.on('close', () => resolve(null));
  });
}

export async function handleSaveRequest(req: IncomingMessage, res: ServerResponse, deps: SaveDeps): Promise<void> {
  const origin = req.headers.origin;
  if (origin && deps.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') return send(res, 204);
  if (!deps.store) return send(res, 503);

  const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
  const userId = token ? await deps.verify(token) : null;
  if (!userId) return send(res, 401);

  if (req.method === 'GET') {
    const got = await deps.store.get(userId);
    return got ? send(res, 200, got) : send(res, 404);
  }
  if (req.method !== 'PUT') return send(res, 405);

  const text = await readBody(req);
  if (text === null) {
    // Reply first, then hang up on whoever is still sending.
    res.setHeader('Connection', 'close');
    res.once('finish', () => req.destroy());
    return send(res, 413);
  }
  let body: { data?: unknown; rev?: unknown };
  try { body = JSON.parse(text); } catch { return send(res, 400); }
  if (typeof body !== 'object' || body === null || !Number.isInteger(body.rev) || (body.rev as number) < 0) return send(res, 400);

  const result = await deps.store.putIfRev(userId, normaliseSynced(body.data), body.rev as number);
  if (result.ok) return send(res, 200, { rev: result.rev });
  return send(res, 409, result.current ?? { data: null, rev: 0 });
}
