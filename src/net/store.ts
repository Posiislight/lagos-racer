// Online state: owns the room socket and clock, mirrors what the lobby needs into zustand.
import { create } from 'zustand';
import type { VehicleId } from '../config/vehicles';
import { useGame } from '../game/store';
import { ClockSync } from './clock';
import { Connection, parseLagSim, type ConnStatus, type NetLink } from './connection';
import { NetSession } from './session';
import { coinsFor, toResults } from './results';
import { cleanNick, normalizeCode, type ClientMessage, type ErrorCode, type GridEntry, type RoomView, type ServerMessage } from './protocol';

export type NetError = ErrorCode | 'unreachable';
export type PendingGrid = { raceSeq: number; grid: GridEntry[]; seed: number; trackId: string; laps: number };

type NetState = {
  status: ConnStatus | 'idle';
  code: string | null;
  mySlot: number | null;
  room: RoomView | null;
  /** Date.now() when the latest room message arrived: the Quick lobby counts down from it. */
  roomAt: number;
  /** The track this player last voted for in a Quick room. */
  myVote: string | null;
  error: NetError | null;
  /** True once a room we were in is out of reach for good: the "Connection don cut" screen. */
  cut: boolean;
  nickname: string;
  pendingGrid: PendingGrid | null;
  create: (name: string, vehicle: VehicleId, paint: string) => void;
  quick: (name: string, vehicle: VehicleId, paint: string) => void;
  vote: (trackId: string) => void;
  join: (code: string, name: string, vehicle: VehicleId, paint: string) => void;
  setVehicle: (v: VehicleId, paint: string) => void;
  setReady: (ready: boolean) => void;
  setFillAI: (fillAI: boolean) => void;
  start: () => void;
  leave: () => void;
};

const NICK_KEY = 'lagos-racer:nick';
const TOKEN_KEY = 'lagos-racer:net-token';
const PING_WARMUP = 5;
const PING_WARMUP_MS = 100;
const PING_EVERY_MS = 5000;
// How long a room back in the lobby after our race may keep its results from us before we stop waiting.
const STRANDED_MS = 3000;
const STRANDED_FLASH_MS = 1500;

export const ERROR_TEXT: Record<NetError, string> = {
  'not-found': 'Room not found',
  full: 'Room full',
  started: 'Race don start already',
  unreachable: 'Connection don cut',
  'bad-name': 'Enter a nickname (up to 16 letters)',
  'bad-code': 'Room codes are 4 letters',
  expired: 'Room don close, start a new one',
  'not-host': 'Only the host can start the race',
  'not-ready': 'Everybody must be ready first',
  busy: 'Server dey busy, try again',
};

function readNick(): string {
  try { return localStorage.getItem(NICK_KEY) ?? ''; } catch { return ''; }
}

let memoryToken: string | null = null;

function readToken(): string | null {
  try { return sessionStorage.getItem(TOKEN_KEY) ?? memoryToken; } catch { return memoryToken; }
}

function writeToken(token: string | null) {
  memoryToken = token;
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch { /* private mode: reconnecting still works within this page */ }
}

const serverUrl = () => import.meta.env.VITE_ROOM_SERVER ?? `ws://${location.hostname}:8787`;

let conn: Connection | null = null;
// Bumped whenever the socket is replaced or dropped, so callbacks from an old one are ignored.
let generation = 0;
let clock = new ClockSync();
let pingTimer: ReturnType<typeof setTimeout> | null = null;
let session: NetSession | null = null;
/** Set by a welcome: the room view that follows says whether the race we were in is still the room's. */
let resyncPending = false;
let strandTimer: ReturnType<typeof setTimeout> | null = null;

export const getClock = (): ClockSync => clock;
export const getLink = (): NetLink | null => conn;
/** The room race in progress (from its grid on), or null. */
export const getSession = (): NetSession | null => session;

function stopPings() {
  if (pingTimer) clearTimeout(pingTimer);
  pingTimer = null;
}

function startPings() {
  stopPings();
  let sent = 0;
  const next = () => {
    conn?.sendJson({ t: 'ping', c: performance.now() });
    sent++;
    pingTimer = setTimeout(next, sent < PING_WARMUP ? PING_WARMUP_MS : PING_EVERY_MS);
  };
  next();
}

// Back from another app (sharing the room link, say): the page's timers may have been frozen, so do not judge the
// socket on that silence, and let the server hear from us straight away.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !conn) return;
    conn.wake();
    conn.sendJson({ t: 'ping', c: performance.now() });
  });
}

/** Forget the socket without telling the server anything. */
function drop() {
  generation++;
  stopPings();
  if (strandTimer) clearTimeout(strandTimer);
  strandTimer = null;
  resyncPending = false;
  session = null;
  const old = conn;
  conn = null;
  old?.close();
}

const idle = { status: 'idle' as const, code: null, mySlot: null, room: null, roomAt: 0, myVote: null, pendingGrid: null, cut: false };

export const useNet = create<NetState>((set, get) => {
  /** Opens a fresh socket; `first` (create or join) goes out as soon as it is open. */
  function open(first: ClientMessage) {
    drop();
    clock = new ClockSync();
    set({ ...idle, error: null });
    const id = generation;
    conn = new Connection(serverUrl(), {
      onOpen: reconnect => {
        if (id !== generation) return;
        if (!reconnect) return conn?.sendJson(first);
        // Never replay create/join on a reconnect: without a token there is no seat to get back.
        const token = readToken();
        if (token) conn?.sendJson({ t: 'resume', token });
        else leaveToOnline('unreachable');
      },
      onMessage: m => { if (id === generation) onMessage(m); },
      onSnapshot: buf => { if (id === generation) session?.onSnapshot(buf); },
      onStatus: s => { if (id === generation) onStatus(s, id); },
    }, { lag: parseLagSim(location.search) });
  }

  function onStatus(s: ConnStatus, id: number) {
    if (s === 'reconnecting' && get().code === null) {
      // Never got in, so there is nothing to resume: say so now instead of after the grace period.
      // Closing from inside the status callback would leave the connection's own timers running, so do it next tick.
      set({ ...idle, error: 'unreachable' });
      setTimeout(() => { if (id === generation) drop(); }, 0);
      return;
    }
    if (s === 'closed') {
      // The connection gave up: the room is out of reach.
      leaveToOnline('unreachable', get().code !== null);
      return;
    }
    set({ status: s });
  }

  function reset(error: NetError | null, cut = false) {
    drop();
    writeToken(null);
    set({ ...idle, error, cut });
  }

  /** Back to the online screen (a race in progress stays up, under the cut modal if `cut`). */
  function leaveToOnline(error: NetError | null, cut = false) {
    reset(error, cut);
    const game = useGame.getState();
    if (game.screen === 'lobby') game.setScreen('online');
  }

  function onMessage(m: ServerMessage) {
    switch (m.t) {
      case 'welcome': {
        writeToken(m.token);
        set({ code: m.code, mySlot: m.slot, error: null });
        startPings();
        resyncPending = true;
        const game = useGame.getState();
        if (game.screen === 'online') game.setScreen('lobby');
        break;
      }
      case 'room':
        set({ room: m.room, roomAt: Date.now() });
        if (resyncPending) {
          resyncPending = false;
          // Back from a drop mid-race: catch the room up on what was lost while the socket was down, unless it has
          // moved on to another race (loaded and finish don't say which race they are for).
          if (session?.raceSeq === m.room.raceSeq) session.resumed();
        }
        if (session?.stranded(m.room)) watchStranded();
        break;
      case 'error':
        // Before we are seated, or when a resume is refused, there is no room to stay in.
        if (m.error === 'expired' || get().code === null) leaveToOnline(m.error, get().code !== null);
        else set({ error: m.error });
        break;
      case 'pong':
        clock.addSample(m.c, m.s, performance.now());
        break;
      case 'grid': {
        // A repeat of the race we already have (say, after a resume) changes nothing.
        const mySlot = get().mySlot;
        if (!conn || mySlot === null || session?.raceSeq === m.raceSeq) break;
        set({ pendingGrid: { raceSeq: m.raceSeq, grid: m.grid, seed: m.seed, trackId: m.trackId, laps: m.laps } });
        // A Quick room says so in every room view; its AI cars are disguised bots.
        const quick = get().room?.quick !== undefined;
        session = new NetSession(conn, clock, { grid: m.grid, mySlot, seed: m.seed, raceSeq: m.raceSeq, quick }, msg => useGame.getState().flash(msg));
        useGame.getState().startOnlineRace();
        break;
      }
      case 'start':
        if (session?.raceSeq === m.raceSeq) session.setStart(m.at);
        break;
      case 'adopt':
        // Bots handed to this phone. Taken from this message only: a grid re-sent for the same race is ignored.
        session?.adopt(m.netIds);
        break;
      case 'pickup':
      case 'use':
      case 'hit':
      case 'finished':
      case 'dnf':
        session?.onEvent(m);
        break;
      case 'results': {
        // The room is back in the lobby; the next grid starts a fresh session.
        const mySlot = get().mySlot;
        const mine = m.results.find(r => !r.ai && r.slot === mySlot);
        const game = useGame.getState();
        // Too late: the stranded fallback has already taken us back to the lobby.
        if (game.screen !== 'race') break;
        if (session?.raceSeq !== m.raceSeq || mySlot === null || !mine || !session.onResults()) break;
        game.finishRace(toResults(m.results, mySlot), mine.place, mine.best, { coins: coinsFor(mine), trackId: get().pendingGrid?.trackId ?? game.track });
        game.setHud({ phase: 'finished' });
        break;
      }
      default:
        break;
    }
  }

  /** The room finished our race without us hearing the results: give it a moment, then go back to the lobby. */
  function watchStranded() {
    if (strandTimer) return;
    const id = generation, mine = session;
    strandTimer = setTimeout(() => {
      strandTimer = null;
      const room = get().room;
      if (id !== generation || session !== mine || !room || !mine?.stranded(room)) return;
      const game = useGame.getState();
      if (game.screen !== 'race' || !game.online) return;
      game.flash('Network wahala');
      setTimeout(() => {
        const g = useGame.getState();
        if (id === generation && session === mine && g.screen === 'race' && g.online && !g.results) g.setScreen('lobby');
      }, STRANDED_FLASH_MS);
    }, STRANDED_MS);
  }

  const sendLobby = (change: { vehicle?: VehicleId; paint?: string; ready?: boolean; fillAI?: boolean }) => {
    set({ error: null });
    conn?.sendJson({ t: 'lobby', ...change });
  };

  const rememberNick = (name: string) => {
    const nickname = cleanNick(name);
    if (nickname === null) return null;
    set({ nickname });
    try { localStorage.setItem(NICK_KEY, nickname); } catch { /* private mode: just not remembered */ }
    return nickname;
  };

  return {
    ...idle,
    error: null,
    nickname: readNick(),
    create: (name, vehicle, paint) => {
      const nick = rememberNick(name);
      if (nick === null) return set({ error: 'bad-name' });
      open({ t: 'create', name: nick, vehicle, paint });
    },
    join: (code, name, vehicle, paint) => {
      const nick = rememberNick(name);
      if (nick === null) return set({ error: 'bad-name' });
      const clean = normalizeCode(code);
      if (!/^[A-Z]{4}$/.test(clean)) return set({ error: 'bad-code' });
      open({ t: 'join', code: clean, name: nick, vehicle, paint });
    },
    quick: (name, vehicle, paint) => {
      const nick = rememberNick(name);
      if (nick === null) return set({ error: 'bad-name' });
      open({ t: 'quick', name: nick, vehicle, paint });
    },
    vote: trackId => {
      set({ myVote: trackId, error: null });
      conn?.sendJson({ t: 'vote', trackId });
    },
    setVehicle: (vehicle, paint) => sendLobby({ vehicle, paint }),
    setReady: ready => sendLobby({ ready }),
    setFillAI: fillAI => sendLobby({ fillAI }),
    start: () => {
      set({ error: null });
      conn?.sendJson({ t: 'start' });
    },
    leave: () => {
      conn?.sendJson({ t: 'leave' });
      reset(null);
      const game = useGame.getState();
      if (game.screen === 'lobby' || game.screen === 'online') game.setScreen('menu');
    },
  };
});

if (import.meta.env.DEV) (window as unknown as { __lrNet: typeof useNet }).__lrNet = useNet;
