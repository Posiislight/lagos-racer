import { createHmac } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryPurchaseStore, handlePayRequest, type PayDeps, type PaystackApi, type PaystackTxn } from './paystack';

const SECRET = 'sk_test_secret';
let server: Server;
afterEach(() => new Promise<void>(r => server.close(() => r())));

/** A fake Paystack: `txns` is what verify returns, `inits` records initialize calls. */
function fakePaystack(txns: Record<string, PaystackTxn> = {}) {
  const inits: Parameters<PaystackApi['initialize']>[0][] = [];
  const api: PaystackApi = {
    initialize: async p => { inits.push(p); return { authorization_url: `https://checkout.paystack.test/${p.reference}`, reference: p.reference }; },
    verify: async ref => txns[ref] ?? null,
  };
  return { api, inits };
}

const txn = (over: Partial<PaystackTxn> = {}): PaystackTxn => ({
  status: 'success', reference: 'ref-1', amount: 50_000, currency: 'NGN', metadata: { userId: USER_A, pack: 'gems-100' }, ...over,
});

async function start(over: Partial<PayDeps> = {}) {
  const deps: PayDeps = {
    store: new MemoryPurchaseStore(),
    paystack: fakePaystack().api,
    secretKey: SECRET,
    allowedOrigins: ['https://game.example'],
    ...over,
  };
  server = createServer((req, res) => void handlePayRequest(req, res, deps));
  await new Promise<void>(r => server.listen(0, r));
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, deps };
}

// 'tok-a' and 'tok-b' stand for two phones; anything else is not a device id.
const DEVICES: Record<string, string> = { 'tok-a': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'tok-b': 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };
const USER_A = `device:${DEVICES['tok-a']}`;
const auth = (t: string) => ({ 'X-Device-Id': DEVICES[t] ?? t, 'Content-Type': 'application/json' });
const EMAIL = 'player@example.com';
const sign = (body: string) => createHmac('sha512', SECRET).update(body).digest('hex');
const webhook = (base: string, event: unknown, signature?: string) => {
  const body = JSON.stringify(event);
  return fetch(`${base}/pay/webhook`, { method: 'POST', headers: { 'x-paystack-signature': signature ?? sign(body) }, body });
};
const total = async (base: string, t = 'tok-a') => (await (await fetch(`${base}/pay/total`, { headers: auth(t) })).json()).total;

describe('/pay/init', () => {
  it('needs a device id', async () => {
    const { base } = await start();
    const r = await fetch(`${base}/pay/init`, { method: 'POST', headers: auth('nope'), body: JSON.stringify({ pack: 'gems-100', email: EMAIL }) });
    expect(r.status).toBe(401);
  });

  it('starts a Paystack checkout priced from the pack table, tied to the player', async () => {
    const ps = fakePaystack();
    const { base } = await start({ paystack: ps.api });
    const r = await fetch(`${base}/pay/init`, { method: 'POST', headers: { ...auth('tok-a'), Origin: 'https://game.example' }, body: JSON.stringify({ pack: 'gems-100', email: EMAIL, amount: 1 }) });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.url).toBe(`https://checkout.paystack.test/${body.reference}`);
    expect(ps.inits).toHaveLength(1);
    expect(ps.inits[0]).toMatchObject({ email: EMAIL, amountKobo: 50_000, callbackUrl: 'https://game.example/', metadata: { userId: USER_A, pack: 'gems-100' } });
  });

  it('rejects a missing or malformed email', async () => {
    const ps = fakePaystack();
    const { base } = await start({ paystack: ps.api });
    for (const email of [undefined, '', 'nope', 'a@b', 42]) {
      const r = await fetch(`${base}/pay/init`, { method: 'POST', headers: auth('tok-a'), body: JSON.stringify({ pack: 'gems-100', email }) });
      expect(r.status).toBe(400);
    }
    expect(ps.inits).toHaveLength(0);
  });

  it('rejects an unknown pack', async () => {
    const { base } = await start();
    const r = await fetch(`${base}/pay/init`, { method: 'POST', headers: auth('tok-a'), body: JSON.stringify({ pack: 'gems-free', email: EMAIL }) });
    expect(r.status).toBe(400);
  });

  it('answers 503 when Paystack is not configured', async () => {
    const { base } = await start({ paystack: null });
    const r = await fetch(`${base}/pay/init`, { method: 'POST', headers: auth('tok-a'), body: JSON.stringify({ pack: 'gems-100', email: EMAIL }) });
    expect(r.status).toBe(503);
  });

  it('refuses a callback origin that is not allowed', async () => {
    const ps = fakePaystack();
    const { base } = await start({ paystack: ps.api });
    await fetch(`${base}/pay/init`, { method: 'POST', headers: { ...auth('tok-a'), Origin: 'https://evil.example' }, body: JSON.stringify({ pack: 'gems-100', email: EMAIL }) });
    expect(ps.inits[0].callbackUrl).toBe('https://game.example/');
  });
});

describe('/pay/webhook', () => {
  const event = (data: PaystackTxn) => ({ event: 'charge.success', data });

  it('rejects a bad or missing signature and credits nothing', async () => {
    const { base } = await start();
    expect((await webhook(base, event(txn()), 'deadbeef')).status).toBe(401);
    expect((await fetch(`${base}/pay/webhook`, { method: 'POST', body: JSON.stringify(event(txn())) })).status).toBe(401);
    expect(await total(base)).toBe(0);
  });

  it('credits the pack once, however many times Paystack retries', async () => {
    const { base } = await start();
    expect((await webhook(base, event(txn()))).status).toBe(200);
    expect(await total(base)).toBe(100);
    expect((await webhook(base, event(txn()))).status).toBe(200);
    expect(await total(base)).toBe(100);
  });

  it('credits an in-game naira pack as coins, not Gems, and only at its own price', async () => {
    const { base } = await start();
    const coins = async () => (await (await fetch(`${base}/pay/total`, { headers: auth('tok-a') })).json()).coins;
    await webhook(base, event(txn({ reference: 'n-1', amount: 150_000, metadata: { userId: USER_A, pack: 'naira-1m' } })));
    expect([await total(base), await coins()]).toEqual([0, 1_000_000]);
    await webhook(base, event(txn({ reference: 'n-2', amount: 50_000, metadata: { userId: USER_A, pack: 'naira-1m' } })));
    expect(await coins()).toBe(1_000_000);
  });

  it('adds up separate purchases', async () => {
    const { base } = await start();
    await webhook(base, event(txn({ reference: 'ref-1' })));
    await webhook(base, event(txn({ reference: 'ref-2' })));
    expect(await total(base)).toBe(200);
  });

  it('ignores a payment of the wrong amount or currency', async () => {
    const { base } = await start();
    await webhook(base, event(txn({ reference: 'a', amount: 100 })));
    await webhook(base, event(txn({ reference: 'b', currency: 'USD' })));
    expect(await total(base)).toBe(0);
  });

  it('ignores unknown packs, missing users and other events', async () => {
    const { base } = await start();
    await webhook(base, event(txn({ reference: 'a', metadata: { userId: USER_A, pack: 'gems-9999' } })));
    await webhook(base, event(txn({ reference: 'b', metadata: null })));
    expect((await webhook(base, { event: 'charge.failed', data: txn({ reference: 'c' }) })).status).toBe(200);
    expect(await total(base)).toBe(0);
  });

  it('answers 503 when no secret key is set, so nothing unsigned is trusted', async () => {
    const { base } = await start({ secretKey: null });
    expect((await webhook(base, event(txn()))).status).toBe(503);
  });
});

describe('/pay/verify', () => {
  it('credits a paid reference for its owner, once', async () => {
    const ps = fakePaystack({ 'ref-1': txn() });
    const { base } = await start({ paystack: ps.api });
    const r = await fetch(`${base}/pay/verify?reference=ref-1`, { headers: auth('tok-a') });
    expect(await r.json()).toMatchObject({ status: 'credited', total: 100 });
    const again = await fetch(`${base}/pay/verify?reference=ref-1`, { headers: auth('tok-a') });
    expect(await again.json()).toMatchObject({ status: 'already', total: 100 });
  });

  it('does not let another player claim it', async () => {
    const ps = fakePaystack({ 'ref-1': txn() });
    const { base } = await start({ paystack: ps.api });
    const r = await fetch(`${base}/pay/verify?reference=ref-1`, { headers: auth('tok-b') });
    expect(await r.json()).toMatchObject({ status: 'invalid', total: 0 });
    expect(await total(base, 'tok-a')).toBe(0);
  });

  it('reports an unpaid reference as pending and an unknown one as 404', async () => {
    const ps = fakePaystack({ 'ref-1': txn({ status: 'abandoned' }) });
    const { base } = await start({ paystack: ps.api });
    expect(await (await fetch(`${base}/pay/verify?reference=ref-1`, { headers: auth('tok-a') })).json()).toMatchObject({ status: 'failed', total: 0 });
    expect((await fetch(`${base}/pay/verify?reference=nope`, { headers: auth('tok-a') })).status).toBe(404);
  });

  it('needs a device id', async () => {
    const { base } = await start();
    expect((await fetch(`${base}/pay/verify?reference=ref-1`)).status).toBe(401);
  });
});
