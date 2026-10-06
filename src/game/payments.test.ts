import { describe, expect, it } from 'vitest';
import { createPayments, referenceFromSearch, withoutPaystackParams } from './payments';

const reply = (status: number, body: unknown): typeof fetch => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
const make = (f: typeof fetch, token: string | null = 'tok') => createPayments({ baseUrl: 'https://srv.test', getToken: async () => token, fetch: f });

describe('payments client', () => {
  it('posts the pack with the session token and returns the checkout url', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const p = make((async (url: string, init: RequestInit) => { seen = { url, init }; return new Response(JSON.stringify({ url: 'https://pay.test/x' })); }) as unknown as typeof fetch);
    expect(await p.checkout('gems-100')).toBe('https://pay.test/x');
    expect(seen!.url).toBe('https://srv.test/pay/init');
    expect(seen!.init.method).toBe('POST');
    expect(seen!.init.body).toBe(JSON.stringify({ pack: 'gems-100' }));
    expect((seen!.init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('returns null when signed out, on a server error, or when offline', async () => {
    expect(await make(reply(200, { url: 'u' }), null).checkout('gems-100')).toBeNull();
    expect(await make(reply(503, {})).checkout('gems-100')).toBeNull();
    expect(await make((async () => { throw new Error('offline'); }) as typeof fetch).total()).toBeNull();
  });

  it('reads the verified status and the lifetime total', async () => {
    expect(await make(reply(200, { status: 'credited', total: 100 })).verify('ref-1')).toEqual({ status: 'credited', total: 100 });
    expect(await make(reply(200, { total: 300 })).total()).toBe(300);
    expect(await make(reply(200, { total: 'x' })).total()).toBeNull();
  });
});

describe('checkout return address', () => {
  it('finds the reference Paystack adds, and nothing in a plain address', () => {
    expect(referenceFromSearch('?trxref=lr_abc&reference=lr_abc')).toBe('lr_abc');
    expect(referenceFromSearch('?reference=lr_abc')).toBe('lr_abc');
    expect(referenceFromSearch('?debug=1')).toBeNull();
    expect(referenceFromSearch('?reference=<script>')).toBeNull();
  });

  it('strips only the Paystack parameters', () => {
    expect(withoutPaystackParams('https://game.test/?debug=1&trxref=a&reference=a#x')).toBe('/?debug=1#x');
    expect(withoutPaystackParams('https://game.test/?reference=a')).toBe('/');
  });
});
