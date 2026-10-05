import type { Saved } from './save';
import { roomServerUrl } from '../net/server';
import { decideSignIn, pickSynced, type SyncedSave } from './syncSave';

export type SyncStatus = 'idle' | 'syncing' | 'saved' | 'offline';

/** Where the last synced revision is remembered between launches (localStorage in the app). */
export type SyncStorage = { get: (key: string) => string | null; set: (key: string, value: string) => void };

const localStorageBacked: SyncStorage = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* the sync still works, it just forgets on restart */ } },
};

export type SyncDeps = {
  baseUrl: string;
  userId: string;
  storage?: SyncStorage;
  /** A fresh session token each call (they expire), or null when signed out. */
  getToken: () => Promise<string | null>;
  fetch: typeof fetch;
  getLocal: () => Saved;
  /** Replace this phone's synced progress with the account's. */
  applyRemote: (remote: SyncedSave) => void;
  onStatus: (s: SyncStatus) => void;
  debounceMs?: number;
};

/** The room server's http address: the same host as VITE_ROOM_SERVER. */
export function syncBaseUrl(server: string = roomServerUrl()): string {
  return server.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
}

type Reply = { status: number; body: { data?: SyncedSave | null; rev?: number } | null };

/**
 * Keeps one signed-in phone and the account's cloud save in step. The account wins: on the first
 * pull, or whenever a push finds a newer revision, the cloud copy replaces this phone's progress.
 * Failures never throw; they leave the status at 'offline' and the next push tries again.
 */
export function createSync(deps: SyncDeps) {
  const debounceMs = deps.debounceMs ?? 3000;
  let rev = 0;
  let ready = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastJson = '';
  const storage = deps.storage ?? localStorageBacked;
  const memoKey = `lagos-racer:sync:${deps.userId}`;
  /** The revision and data this phone last had in step with the account, or null on a first sign-in here. */
  const recall = (): { rev: number; json: string } | null => {
    try { const m = JSON.parse(storage.get(memoKey) ?? 'null'); return typeof m?.rev === 'number' && typeof m?.json === 'string' ? m : null; } catch { return null; }
  };
  const remember = () => storage.set(memoKey, JSON.stringify({ rev, json: lastJson }));
  let queue: Promise<void> = Promise.resolve();

  const setStatus = (s: SyncStatus) => { if (!stopped) deps.onStatus(s); };

  async function request(method: 'GET' | 'PUT', body?: unknown): Promise<Reply | null> {
    const token = await deps.getToken();
    if (!token) { setStatus('idle'); return null; }
    const res = await deps.fetch(`${deps.baseUrl}/save`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  }

  function take(remote: SyncedSave, newRev: number) {
    deps.applyRemote(remote);
    lastJson = JSON.stringify(remote);
    rev = newRev;
    remember();
  }

  async function put(retry = true): Promise<boolean> {
    const data = pickSynced(deps.getLocal());
    const json = JSON.stringify(data);
    if (json === lastJson) { setStatus('saved'); return true; }
    const r = await request('PUT', { data, rev });
    if (!r) return false;
    if (r.status === 200 && typeof r.body?.rev === 'number') { rev = r.body.rev; lastJson = json; remember(); setStatus('saved'); return true; }
    if (r.status === 409) {
      rev = r.body?.rev ?? 0;
      if (r.body?.data) { take(r.body.data, rev); setStatus('saved'); return true; }
      // The account has no save after all: start again from revision 0, once.
      if (retry) return put(false);
    }
    setStatus('offline');
    return false;
  }

  async function pull(): Promise<void> {
    const r = await request('GET');
    if (!r) return;
    if (r.status !== 200 && r.status !== 404) return setStatus('offline');
    const remote = r.status === 200 ? r.body?.data ?? null : null;
    rev = r.status === 200 ? r.body?.rev ?? 0 : 0;
    const memo = recall();
    const unsynced = memo !== null && JSON.stringify(pickSynced(deps.getLocal())) !== memo.json;
    let action = decideSignIn(deps.getLocal(), remote);
    if (memo) {
      // This phone has synced this account before: its own newer progress is pushed, unless
      // another device has moved the account on since (then the account wins).
      if (unsynced && memo.rev === rev) action = 'upload';
      else if (remote && (memo.rev !== rev || unsynced)) action = 'download';
      else action = 'none';
    }
    if (action === 'download' && remote) take(remote, rev);
    else if (action === 'none' && remote) { lastJson = JSON.stringify(remote); remember(); }
    ready = true;
    if (action === 'upload') await put();
    else setStatus('saved');
  }

  /** Runs one job at a time, so a slow push cannot overlap the next. */
  function run(job: () => Promise<void>): Promise<void> {
    queue = queue.then(async () => {
      if (stopped) return;
      setStatus('syncing');
      try { await job(); } catch { setStatus('offline'); }
    });
    return queue;
  }

  const onOnline = () => { void flush(); };
  if (typeof window !== 'undefined') window.addEventListener('online', onOnline);

  function start() { return run(pull); }

  function flush() {
    clearTimeout(timer);
    return run(async () => { if (ready) await put(); else await pull(); });
  }

  function schedulePush() {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(() => { void flush(); }, debounceMs);
  }

  function stop() {
    stopped = true;
    clearTimeout(timer);
    if (typeof window !== 'undefined') window.removeEventListener('online', onOnline);
  }

  return { start, schedulePush, flush, stop };
}
