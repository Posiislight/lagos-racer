// Online state: owns the room socket and clock, mirrors what the lobby needs into zustand.
import { create } from 'zustand';
import type { VehicleId } from '../config/vehicles';
import { useGame } from '../game/store';
import { ClockSync } from './clock';
import { Connection, parseLagSim, type ConnStatus, type NetLink } from './connection';
import { NetSession } from './session';
import { cleanNick, normalizeCode, type ClientMessage, type ErrorCode, type GridEntry, type RoomView, type ServerMessage } from './protocol';

export type NetError = ErrorCode | 'unreachable';
export type PendingGrid = { raceSeq: number; grid: GridEntry[]; seed: number; trackId: string; laps: number };

type NetState = {
  status: ConnStatus | 'idle';
  code: string | null;
  mySlot: number | null;
  room: RoomView | null;
  error: NetError | null;
  nickname: string;
  pendingGrid: PendingGrid | null;
  create: (name: string, vehicle: VehicleId) => void;
  join: (code: string, name: string, vehicle: VehicleId) => void;
  setVehicle: (v: VehicleId) => void;
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

/** Forget the socket without telling the server anything. */
function drop() {
  generation++;
  stopPings();
  session = null;
  const old = conn;
  conn = null;
  old?.close();
}

const idle = { status: 'idle' as const, code: null, mySlot: null, room: null, pendingGrid: null };

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
      leaveToOnline('unreachable');
      return;
    }
    set({ status: s });
  }

  function reset(error: NetError | null) {
    drop();
    writeToken(null);
    set({ ...idle, error });
  }

  function leaveToOnline(error: NetError | null) {
    reset(error);
    const game = useGame.getState();
    if (game.screen === 'lobby') game.setScreen('online');
  }

  function onMessage(m: ServerMessage) {
    switch (m.t) {
      case 'welcome': {
        writeToken(m.token);
        set({ code: m.code, mySlot: m.slot, error: null });
        startPings();
        const game = useGame.getState();
        if (game.screen === 'online') game.setScreen('lobby');
        break;
      }
      case 'room':
        set({ room: m.room });
        break;
      case 'error':
        // Before we are seated, or when a resume is refused, there is no room to stay in.
        if (m.error === 'expired' || get().code === null) leaveToOnline(m.error);
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
        session = new NetSession(conn, clock, { grid: m.grid, mySlot, seed: m.seed, raceSeq: m.raceSeq });
        useGame.getState().startOnlineRace();
        break;
      }
      case 'start':
        if (session?.raceSeq === m.raceSeq) session.setStart(m.at);
        break;
      case 'pickup':
      case 'use':
      case 'hit':
        session?.onEvent(m);
        break;
      default:
        break;
    }
  }

  const sendLobby = (change: { vehicle?: VehicleId; ready?: boolean; fillAI?: boolean }) => {
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
    create: (name, vehicle) => {
      const nick = rememberNick(name);
      if (nick === null) return set({ error: 'bad-name' });
      open({ t: 'create', name: nick, vehicle });
    },
    join: (code, name, vehicle) => {
      const nick = rememberNick(name);
      if (nick === null) return set({ error: 'bad-name' });
      const clean = normalizeCode(code);
      if (!/^[A-Z]{4}$/.test(clean)) return set({ error: 'bad-code' });
      open({ t: 'join', code: clean, name: nick, vehicle });
    },
    setVehicle: vehicle => sendLobby({ vehicle }),
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
