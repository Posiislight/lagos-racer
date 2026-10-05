import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { MemorySaveStore, handleSaveRequest, type SaveDeps } from './saves';

let server: Server;
afterEach(() => new Promise<void>(r => server.close(() => r())));

async function start(over: Partial<SaveDeps> = {}) {
  const deps: SaveDeps = {
    store: new MemorySaveStore(),
    verify: async t => ({ 'tok-a': 'user-a', 'tok-b': 'user-b' } as Record<string, string>)[t] ?? null,
    allowedOrigins: ['https://game.example'],
    ...over,
  };
  server = createServer((req, res) => void handleSaveRequest(req, res, deps));
  await new Promise<void>(r => server.listen(0, r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/save`;
}

const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
const put = (url: string, t: string, body: unknown) => fetch(url, { method: 'PUT', headers: auth(t), body: JSON.stringify(body) });

describe('/save', () => {
  it('rejects a missing or bad token', async () => {
    const url = await start();
    expect((await fetch(url)).status).toBe(401);
    expect((await fetch(url, { headers: auth('nope') })).status).toBe(401);
  });

  it('round-trips a save and bumps the revision', async () => {
    const url = await start();
    expect((await fetch(url, { headers: auth('tok-a') })).status).toBe(404);
    const r = await put(url, 'tok-a', { data: { coins: 50 }, rev: 0 });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ rev: 1 });
    const got = await (await fetch(url, { headers: auth('tok-a') })).json();
    expect(got.rev).toBe(1);
    expect(got.data.coins).toBe(50);
  });

  it('answers 409 with the current save when the revision is stale', async () => {
    const url = await start();
    await put(url, 'tok-a', { data: { coins: 50 }, rev: 0 });
    const r = await put(url, 'tok-a', { data: { coins: 99 }, rev: 0 });
    expect(r.status).toBe(409);
    const body = await r.json();
    expect(body.rev).toBe(1);
    expect(body.data.coins).toBe(50);
  });

  it('keeps users apart', async () => {
    const url = await start();
    await put(url, 'tok-a', { data: { coins: 50 }, rev: 0 });
    expect((await fetch(url, { headers: auth('tok-b') })).status).toBe(404);
  });

  it('normalises what it stores', async () => {
    const url = await start();
    await put(url, 'tok-a', { data: { premium: -9, junk: 1 }, rev: 0 });
    const got = await (await fetch(url, { headers: auth('tok-a') })).json();
    expect(got.data.premium).toBeGreaterThanOrEqual(0);
    expect('junk' in got.data).toBe(false);
  });

  it('rejects bodies over 64 KB and malformed bodies', async () => {
    const url = await start();
    const big = await put(url, 'tok-a', { data: { pad: 'x'.repeat(70_000) }, rev: 0 });
    expect(big.status).toBe(413);
    const bad = await fetch(url, { method: 'PUT', headers: auth('tok-a'), body: '{nope' });
    expect(bad.status).toBe(400);
    expect((await put(url, 'tok-a', { data: {}, rev: 'x' })).status).toBe(400);
  });

  it('answers 503 with no store', async () => {
    const url = await start({ store: null });
    expect((await fetch(url, { headers: auth('tok-a') })).status).toBe(503);
  });

  it('sets CORS headers only for allowed origins', async () => {
    const url = await start();
    const ok = await fetch(url, { method: 'OPTIONS', headers: { Origin: 'https://game.example' } });
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://game.example');
    const no = await fetch(url, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
    expect(no.headers.get('access-control-allow-origin')).toBeNull();
  });
});
