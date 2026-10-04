// Browser side of the room socket: reconnects after drops and can fake a bad network for testing.
import { RECONNECT_GRACE_MS, SILENCE_MS, type ClientMessage, type ServerMessage } from './protocol';

export type ConnStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface NetLink {
  sendJson(msg: ClientMessage): void;
  sendBinary(buf: ArrayBuffer): void;
}

export type LagSim = { lag: number; jitter: number; loss: number };

type Handlers = {
  onOpen(reconnect: boolean): void;
  onMessage(m: ServerMessage): void;
  onSnapshot(buf: ArrayBuffer): void;
  onStatus(s: ConnStatus): void;
};

type Opts = {
  lag?: LagSim | null;
  WebSocketImpl?: typeof WebSocket;
  now?: () => number;
  setTimer?: typeof setTimeout;
  random?: () => number;
};

const BACKOFF_MS = [500, 1000, 2000, 4000];
const SILENCE_CHECK_MS = 1000;

/** Reads ?lag=&jitter=&loss= (ms, ms, percent); null when none are present. */
export function parseLagSim(search: string): LagSim | null {
  const q = new URLSearchParams(search);
  if (!q.has('lag') && !q.has('jitter') && !q.has('loss')) return null;
  const num = (k: string) => {
    const n = Number(q.get(k));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  return { lag: num('lag'), jitter: num('jitter'), loss: num('loss') };
}

export class Connection implements NetLink {
  private ws: WebSocket | null = null;
  private status: ConnStatus = 'connecting';
  private everOpened = false;
  private intentional = false;
  private attempt = 0;
  private droppedAt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private giveUpTimer: ReturnType<typeof setTimeout> | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastHeardAt = 0;
  private lastOutAt = 0;
  private lastInAt = 0;
  private readonly now: () => number;
  private readonly setTimer: typeof setTimeout;
  private readonly random: () => number;
  private readonly lag: LagSim | null;
  private readonly WS: typeof WebSocket | undefined;

  constructor(private readonly url: string, private readonly h: Handlers, opts: Opts = {}) {
    this.now = opts.now ?? (() => Date.now());
    this.setTimer = opts.setTimer ?? (((fn: () => void, ms?: number) => setTimeout(fn, ms)) as typeof setTimeout);
    this.random = opts.random ?? Math.random;
    this.lag = opts.lag ?? null;
    this.WS = opts.WebSocketImpl;
    this.h.onStatus('connecting');
    this.connect();
  }

  sendJson(msg: ClientMessage) {
    this.send(JSON.stringify(msg));
  }

  sendBinary(buf: ArrayBuffer) {
    this.send(buf);
  }

  /** Intentional close: no reconnect. */
  close() {
    this.shutDown();
  }

  /** The page is visible again: give the open socket a fresh 12 s to be heard from before judging it dead. */
  wake() {
    if (this.ws && this.status === 'open') this.watchSilence(this.ws);
  }

  private shutDown() {
    this.intentional = true;
    this.clearTimers();
    this.stopSilenceWatch();
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.setStatus('closed');
  }

  private connect() {
    const Impl = this.WS ?? WebSocket;
    const ws = new Impl(this.url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      if (ws !== this.ws) return;
      const reconnect = this.everOpened;
      this.everOpened = true;
      this.attempt = 0;
      this.clearTimers();
      this.setStatus('open');
      this.watchSilence(ws);
      this.h.onOpen(reconnect);
    };
    ws.onmessage = (e) => {
      if (ws !== this.ws) return;
      this.lastHeardAt = this.now();
      this.deliverIn(() => {
        if (ws !== this.ws) return;
        const data = e.data as unknown;
        if (typeof data === 'string') {
          try {
            this.h.onMessage(JSON.parse(data) as ServerMessage);
          } catch {
            // garbage frame: drop it
          }
        } else if (data instanceof ArrayBuffer) {
          this.h.onSnapshot(data);
        }
      });
    };
    ws.onclose = () => {
      if (ws !== this.ws || this.intentional) return;
      this.ws = null;
      this.stopSilenceWatch();
      this.onDrop();
    };
  }

  /**
   * Mobile data can vanish without the socket ever closing. The server pongs every ping (5 s), so silence this long
   * means the link is dead: drop it ourselves and let the reconnect take over. A page that was asleep in the
   * background (timers frozen) gets a fresh 12 s instead: its own silence is not the link's fault.
   */
  private watchSilence(ws: WebSocket) {
    this.stopSilenceWatch();
    this.lastHeardAt = this.now();
    let checkedAt = this.now();
    const check = () => {
      this.silenceTimer = null;
      if (ws !== this.ws) return;
      const now = this.now();
      if (now - checkedAt > SILENCE_CHECK_MS * 3) this.lastHeardAt = now;
      checkedAt = now;
      if (now - this.lastHeardAt < SILENCE_MS) {
        this.silenceTimer = this.setTimer(check, SILENCE_CHECK_MS);
        return;
      }
      this.ws = null;
      ws.close();
      this.onDrop();
    };
    this.silenceTimer = this.setTimer(check, SILENCE_CHECK_MS);
  }

  private stopSilenceWatch() {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = null;
  }

  private onDrop() {
    if (this.status !== 'reconnecting') {
      this.droppedAt = this.now();
      this.setStatus('reconnecting');
      this.giveUpTimer = this.setTimer(() => this.shutDown(), RECONNECT_GRACE_MS);
    }
    const wait = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)];
    this.attempt++;
    this.retryTimer = this.setTimer(() => {
      this.retryTimer = null;
      if (this.now() - this.droppedAt >= RECONNECT_GRACE_MS) this.shutDown();
      else this.connect();
    }, wait);
  }

  // setTimer is only injected to fake time in tests, where the global clear works on the same fake clock.
  private clearTimers() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.giveUpTimer) clearTimeout(this.giveUpTimer);
    this.retryTimer = this.giveUpTimer = null;
  }

  private setStatus(s: ConnStatus) {
    if (s === this.status) return;
    this.status = s;
    this.h.onStatus(s);
  }

  private send(data: string | ArrayBuffer) {
    const ws = this.ws;
    if (!ws || this.status !== 'open') return;
    this.deliverOut(() => {
      if (ws === this.ws && this.status === 'open') ws.send(data);
    });
  }

  private deliverOut(fn: () => void) {
    this.lastOutAt = this.schedule(fn, this.lastOutAt);
  }

  private deliverIn(fn: () => void) {
    this.lastInAt = this.schedule(fn, this.lastInAt);
  }

  /** Runs fn now, or after the simulated delay without ever overtaking the previous one. */
  private schedule(fn: () => void, previousAt: number): number {
    if (!this.lag) {
      fn();
      return previousAt;
    }
    const { lag, jitter, loss } = this.lag;
    let delay = lag / 2 + this.random() * (jitter / 2);
    if (loss > 0 && this.random() * 100 < loss) delay += 200 + this.random() * 200; // stands in for a TCP retransmit
    const now = this.now();
    const at = Math.max(now + delay, previousAt);
    this.setTimer(fn, at - now);
    return at;
  }
}
