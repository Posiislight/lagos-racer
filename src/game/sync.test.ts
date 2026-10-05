import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSave, type Saved } from './save';
import { pickSynced, type SyncedSave } from './syncSave';
import { createSync, syncBaseUrl, type SyncStatus } from './sync';

type Stored = { data: SyncedSave; rev: number } | null;

/** A fake /save endpoint: the same revision rules as the real server. */
function fakeServer(initial: Stored = null) {
  const s = { row: initial, puts: [] as { rev: number; auth: string | null; data: SyncedSave }[], down: false };
  const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
    if (s.down) throw new TypeError('network down');
    const auth = new Headers(init?.headers).get('Authorization');
    if (!init?.method || init.method === 'GET') {
      return s.row ? Response.json(s.row) : new Response(null, { status: 404 });
    }
    const body = JSON.parse(init.body as string);
    s.puts.push({ rev: body.rev, auth, data: body.data });
    if ((s.row?.rev ?? 0) !== body.rev) return Response.json(s.row, { status: 409 });
    s.row = { data: body.data, rev: body.rev + 1 };
    return Response.json({ rev: s.row.rev });
  });
  return { s, fetchFn: fetchFn as unknown as typeof fetch };
}

const played = (): Saved => ({ ...defaultSave(), races: 3, coins: 400 });

function setup(initial: Stored, local: Saved = played(), getToken: () => Promise<string | null> = async () => 'tok') {
  const srv = fakeServer(initial);
  const statuses: SyncStatus[] = [];
  const applied: SyncedSave[] = [];
  let current = local;
  const sync = createSync({
    baseUrl: 'http://x', getToken, fetch: srv.fetchFn,
    getLocal: () => current, applyRemote: r => { applied.push(r); },
    onStatus: st => statuses.push(st),
  });
  return { srv, statuses, applied, sync, setLocal: (l: Saved) => { current = l; } };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('syncBaseUrl', () => {
  it('turns the room server address into its http address', () => {
    expect(syncBaseUrl('wss://rooms.example')).toBe('https://rooms.example');
    expect(syncBaseUrl('ws://localhost:8787')).toBe('http://localhost:8787');
  });
});

describe('start', () => {
  it('uploads local progress when the account has no save', async () => {
    const t = setup(null);
    await t.sync.start();
    expect(t.srv.s.puts).toHaveLength(1);
    expect(t.srv.s.puts[0].rev).toBe(0);
    expect(t.statuses.at(-1)).toBe('saved');
  });

  it('downloads when the account has progress, and sends nothing', async () => {
    const t = setup({ data: { ...pickSynced(played()), coins: 900 }, rev: 4 });
    await t.sync.start();
    expect(t.applied[0].coins).toBe(900);
    expect(t.srv.s.puts).toHaveLength(0);
  });

  it('uploads over an empty cloud save', async () => {
    const t = setup({ data: pickSynced(defaultSave()), rev: 2 });
    await t.sync.start();
    expect(t.srv.s.puts[0].rev).toBe(2);
    expect(t.applied).toHaveLength(0);
  });

  it('goes offline when the server is down, then recovers on flush', async () => {
    const t = setup(null);
    t.srv.s.down = true;
    await t.sync.start();
    expect(t.statuses.at(-1)).toBe('offline');
    t.srv.s.down = false;
    await t.sync.flush();
    expect(t.statuses.at(-1)).toBe('saved');
    expect(t.srv.s.puts).toHaveLength(1);
  });
});

describe('pushing', () => {
  it('coalesces saves into one push after the debounce', async () => {
    const t = setup(null);
    await t.sync.start();
    t.srv.s.puts.length = 0;
    t.setLocal({ ...played(), coins: 777 });
    t.sync.schedulePush(); t.sync.schedulePush(); t.sync.schedulePush();
    await vi.advanceTimersByTimeAsync(2900);
    expect(t.srv.s.puts).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(200);
    expect(t.srv.s.puts).toHaveLength(1);
    expect(t.srv.s.puts[0].data.coins).toBe(777);
  });

  it('flush pushes at once', async () => {
    const t = setup(null);
    await t.sync.start();
    t.srv.s.puts.length = 0;
    t.setLocal({ ...played(), coins: 5 });
    await t.sync.flush();
    expect(t.srv.s.puts).toHaveLength(1);
  });

  it('does not push before start has succeeded', async () => {
    const t = setup(null);
    t.sync.schedulePush();
    await vi.advanceTimersByTimeAsync(3100);
    // the push retries the pull first, which finds no save and uploads once
    expect(t.srv.s.puts.every(p => p.rev === 0)).toBe(true);
  });

  it('takes the account save on a 409 and does not loop', async () => {
    const t = setup(null);
    await t.sync.start();
    t.srv.s.row = { data: { ...pickSynced(played()), coins: 1234 }, rev: 9 };
    t.setLocal({ ...played(), coins: 50 });
    await t.sync.flush();
    expect(t.applied.at(-1)?.coins).toBe(1234);
    expect(t.srv.s.puts).toHaveLength(2);
  });

  it('stop cancels a pending push', async () => {
    const t = setup(null);
    await t.sync.start();
    t.srv.s.puts.length = 0;
    t.setLocal({ ...played(), coins: 5 });
    t.sync.schedulePush();
    t.sync.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.srv.s.puts).toHaveLength(0);
  });

  it('asks for a fresh token on every request', async () => {
    let n = 0;
    const t = setup(null, played(), async () => `tok-${++n}`);
    await t.sync.start();
    t.setLocal({ ...played(), coins: 5 });
    await t.sync.flush();
    expect(t.srv.s.puts.map(p => p.auth)).toEqual(['Bearer tok-2', 'Bearer tok-3']);
  });

  it('sends nothing and shows idle when there is no token', async () => {
    const t = setup(null, played(), async () => null);
    await t.sync.start();
    expect(t.srv.fetchFn).not.toHaveBeenCalled();
    expect(t.statuses.at(-1)).toBe('idle');
  });
});
