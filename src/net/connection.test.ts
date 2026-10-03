import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Connection, parseLagSim, type ConnStatus } from './connection';
import { RECONNECT_GRACE_MS, type ServerMessage } from './protocol';

class FakeSocket {
  static all: FakeSocket[] = [];
  binaryType = '';
  closeCalls = 0;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  send(d: unknown) {
    this.sent.push(d);
  }
  close() {
    this.closeCalls++;
    this.onclose?.();
  }
  open() {
    this.onopen?.();
  }
  drop() {
    this.onclose?.();
  }
  serverSend(data: unknown) {
    this.onmessage?.({ data });
  }
}

const Impl = FakeSocket as unknown as typeof WebSocket;
const last = () => FakeSocket.all[FakeSocket.all.length - 1];

function setup(opts: ConstructorParameters<typeof Connection>[2] = {}) {
  const log = {
    opens: [] as boolean[],
    msgs: [] as ServerMessage[],
    snaps: [] as ArrayBuffer[],
    status: [] as ConnStatus[],
  };
  const conn = new Connection(
    'ws://test',
    {
      onOpen: (r) => log.opens.push(r),
      onMessage: (m) => log.msgs.push(m),
      onSnapshot: (b) => log.snaps.push(b),
      onStatus: (s) => log.status.push(s),
    },
    { WebSocketImpl: Impl, ...opts },
  );
  return { conn, log };
}

beforeEach(() => {
  FakeSocket.all = [];
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('Connection', () => {
  it('opens, sets arraybuffer, and routes text and binary frames', () => {
    const { conn, log } = setup();
    const ws = last();
    expect(ws.binaryType).toBe('arraybuffer');
    ws.open();
    expect(log.opens).toEqual([false]);
    expect(log.status).toEqual(['connecting', 'open']);
    ws.serverSend(JSON.stringify({ t: 'pong', c: 1, s: 2 }));
    ws.serverSend('not json{');
    const buf = new ArrayBuffer(8);
    ws.serverSend(buf);
    expect(log.msgs).toEqual([{ t: 'pong', c: 1, s: 2 }]);
    expect(log.snaps).toEqual([buf]);
    conn.sendJson({ t: 'ping', c: 3 });
    conn.sendBinary(buf);
    expect(ws.sent).toEqual([JSON.stringify({ t: 'ping', c: 3 }), buf]);
  });

  it('drops sends while not open', () => {
    const { conn } = setup();
    conn.sendJson({ t: 'ping', c: 1 });
    expect(last().sent).toEqual([]);
  });

  it('reconnects with backoff 500, 1000, 2000, 4000 ms and calls onOpen(true)', () => {
    const { log } = setup();
    last().open();
    last().drop();
    expect(log.status.at(-1)).toBe('reconnecting');
    const delays = [500, 1000, 2000, 4000, 4000];
    for (const [i, d] of delays.entries()) {
      expect(FakeSocket.all).toHaveLength(i + 1);
      vi.advanceTimersByTime(d - 1);
      expect(FakeSocket.all).toHaveLength(i + 1);
      vi.advanceTimersByTime(1);
      expect(FakeSocket.all).toHaveLength(i + 2);
      if (i < delays.length - 1) last().drop();
    }
    last().open();
    expect(log.opens).toEqual([false, true]);
    expect(log.status.at(-1)).toBe('open');
  });

  it('gives up and reports closed 15 s after the drop', () => {
    const { log } = setup();
    last().open();
    last().drop();
    vi.advanceTimersByTime(RECONNECT_GRACE_MS - 1);
    const pending = last(); // attempt started at 11.5 s, still handshaking
    expect(log.status.at(-1)).toBe('reconnecting');
    vi.advanceTimersByTime(1);
    expect(log.status.at(-1)).toBe('closed');
    expect(pending.closeCalls).toBe(1);
    pending.open(); // a late open must not revive a connection already reported closed
    expect(log.opens).toEqual([false]);
    expect(log.status.at(-1)).toBe('closed');
    const n = FakeSocket.all.length;
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.all).toHaveLength(n);
  });

  it('does not reconnect after close()', () => {
    const { conn, log } = setup();
    last().open();
    conn.close();
    expect(log.status.at(-1)).toBe('closed');
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.all).toHaveLength(1);
  });

  it('does not reconnect when close() is called mid-reconnect', () => {
    const { conn } = setup();
    last().open();
    last().drop();
    conn.close();
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.all).toHaveLength(1);
  });

  it('parses ?lag=250&jitter=80&loss=5 and returns null without params', () => {
    expect(parseLagSim('?lag=250&jitter=80&loss=5')).toEqual({ lag: 250, jitter: 80, loss: 5 });
    expect(parseLagSim('?lag=100')).toEqual({ lag: 100, jitter: 0, loss: 0 });
    expect(parseLagSim('')).toBeNull();
    expect(parseLagSim('?room=ABCD')).toBeNull();
  });

  it('with lag simulation, delivers in order even when jitter would reorder', () => {
    const rolls = [0.9, 0]; // first message gets the long jitter, second the short
    const random = () => rolls.shift() ?? 0;
    const { conn, log } = setup({ lag: { lag: 100, jitter: 100, loss: 0 }, random });
    const ws = last();
    ws.open();
    ws.serverSend(JSON.stringify({ t: 'pong', c: 1, s: 0 }));
    ws.serverSend(JSON.stringify({ t: 'pong', c: 2, s: 0 }));
    expect(log.msgs).toEqual([]);
    vi.advanceTimersByTime(94);
    expect(log.msgs).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(log.msgs.map((m) => (m as { c: number }).c)).toEqual([1, 2]);

    rolls.push(0.9, 0);
    conn.sendJson({ t: 'ping', c: 1 });
    conn.sendJson({ t: 'ping', c: 2 });
    expect(ws.sent).toEqual([]);
    vi.advanceTimersByTime(95);
    expect(ws.sent).toEqual([JSON.stringify({ t: 'ping', c: 1 }), JSON.stringify({ t: 'ping', c: 2 })]);
  });

  it('adds 200-400 ms with probability loss%', () => {
    const rolls = [0, 0, 0.5]; // jitter, loss roll (0 < 50%), extra = 200 + 0.5 * 200
    const random = () => rolls.shift() ?? 0;
    const { log } = setup({ lag: { lag: 0, jitter: 0, loss: 50 }, random });
    const ws = last();
    ws.open();
    ws.serverSend(JSON.stringify({ t: 'pong', c: 1, s: 0 }));
    vi.advanceTimersByTime(299);
    expect(log.msgs).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(log.msgs).toHaveLength(1);
  });
});
