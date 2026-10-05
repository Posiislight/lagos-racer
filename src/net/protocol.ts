// Shared by the browser client and the room server: no DOM, no runtime imports from game code.
import type { Hazard } from '../game/runtime';
import type { VehicleId } from '../config/vehicles';

export const TICK_HZ = 15;
export const RECONNECT_GRACE_MS = 15000;
export const ROOM_IDLE_MS = 600000;
export const LOAD_TIMEOUT_MS = 20000;
export const START_LEAD_MS = 3500;
export const FINISH_CUTOFF_MS = 30000;
export const MAX_HUMANS = 6;
export const GRID_SIZE = 6;
// Quick race: how long a quick room waits for more players, how many may exist, and where bot slots start (above MAX_HUMANS).
export const QUICK_WAIT_MS = 30000;
export const MAX_QUICK_ROOMS = 50;
export const BOT_SLOT_BASE = 7;
export const MAX_MESSAGE_BYTES = 4096;
export const RATE_LIMIT_PER_S = 30;
// Either end gives up on a socket it has heard nothing from for this long (pings go out every 5 s).
export const SILENCE_MS = 12000;
// A socket that never takes a seat is closed after this long.
export const UNSEATED_MS = 30000;
// In the lobby a phone may be off in another app sharing the link: be much more patient there.
export const LOBBY_SILENCE_MS = 90000;
export const LOBBY_GRACE_MS = 120000;

// No I or O, so codes survive being read out over a voice note.
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const NICK_MAX = 16;

export const FLAG = { boost: 1, slip: 2, curse: 4, wobble: 8, horn: 16, finished: 32, shield: 64 } as const;

export type RoomPhase = 'lobby' | 'loading' | 'countdown' | 'racing';
export type ErrorCode = 'not-found' | 'full' | 'started' | 'bad-name' | 'bad-code' | 'expired' | 'not-host' | 'not-ready' | 'busy';

/** paint is one of the vehicle's paint ids (see paintOf). */
export type PlayerInfo = { slot: number; name: string; vehicle: VehicleId; paint: string; ready: boolean; connected: boolean };
/** Quick race lobby state: time until the race starts and the track votes (trackId -> vote count). */
export type QuickView = { startsInMs: number; votes: Record<string, number> };
export type RoomView = { code: string; phase: RoomPhase; hostSlot: number; fillAI: boolean; raceSeq: number; players: PlayerInfo[]; quick?: QuickView };

/** slot is the owning human's slot; netId is the grid index, front to back. */
export type GridEntry = { netId: number; slot: number; name: string; vehicle: VehicleId; paint: string; ai: boolean };

export type NetResult = {
  netId: number;
  slot: number;
  ai: boolean;
  name: string;
  vehicle: VehicleId;
  paint: string;
  place: number;
  time: number | null;
  projected: boolean;
  best: number | null;
  dnf: boolean;
};

/** WebRTC setup traffic for voice chat, relayed untouched between two players (the audio itself never touches the server). */
export type RtcSignal =
  | { kind: 'offer'; sdp: string }
  | { kind: 'answer'; sdp: string }
  | { kind: 'ice'; candidate: string; mid: string | null; index: number | null };

export type ClientMessage =
  | { t: 'rtc'; to: number; signal: RtcSignal }
  | { t: 'create'; name: string; vehicle: VehicleId; paint: string }
  | { t: 'join'; code: string; name: string; vehicle: VehicleId; paint: string }
  | { t: 'quick'; name: string; vehicle: VehicleId; paint: string }
  | { t: 'vote'; trackId: string }
  | { t: 'resume'; token: string }
  | { t: 'ping'; c: number }
  | { t: 'lobby'; vehicle?: VehicleId; paint?: string; ready?: boolean; fillAI?: boolean }
  | { t: 'start' }
  | { t: 'loaded' }
  | { t: 'pickup'; orb: number }
  | { t: 'use'; hazard: Hazard }
  | { t: 'hit'; hazard: number; netId: number }
  | { t: 'finish'; netId: number; laps: number[]; time: number }
  | { t: 'leave' };

export type ServerMessage =
  | { t: 'rtc'; from: number; signal: RtcSignal }
  | { t: 'welcome'; code: string; slot: number; token: string }
  | { t: 'room'; room: RoomView }
  | { t: 'error'; error: ErrorCode }
  | { t: 'pong'; c: number; s: number }
  | { t: 'grid'; raceSeq: number; grid: GridEntry[]; seed: number; trackId: string; laps: number }
  | { t: 'start'; raceSeq: number; at: number }
  | { t: 'pickup'; orb: number; from: number }
  | { t: 'use'; hazard: Hazard; from: number }
  | { t: 'hit'; hazard: number; netId: number; from: number }
  | { t: 'finished'; netId: number; time: number }
  | { t: 'dnf'; netIds: number[] }
  | { t: 'adopt'; netIds: number[] }
  | { t: 'results'; raceSeq: number; results: NetResult[] };

export type CarState = {
  netId: number;
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  vx: number;
  vy: number;
  vz: number;
  distance: number;
  laps: number;
  flags: number;
};

export type Snapshot = { slot: number; raceSeq: number; time: number; cars: CarState[] };

const VERSION = 1;
const HEADER_BYTES = 8;
const CAR_BYTES = 33;
const Q_SCALE = 32767;
const V_SCALE = 100; // cm/s

const clamp16 = (n: number) => Math.max(-32768, Math.min(32767, Math.round(n)));

export function encodeSnapshot(s: Snapshot): ArrayBuffer {
  const buf = new ArrayBuffer(HEADER_BYTES + s.cars.length * CAR_BYTES);
  const v = new DataView(buf);
  v.setUint8(0, VERSION);
  v.setUint8(1, s.slot);
  v.setUint8(2, s.raceSeq & 255);
  v.setUint8(3, s.cars.length);
  v.setFloat32(4, s.time, true);
  s.cars.forEach((c, i) => {
    let o = HEADER_BYTES + i * CAR_BYTES;
    v.setUint8(o, c.netId);
    v.setFloat32(o + 1, c.x, true);
    v.setFloat32(o + 5, c.y, true);
    v.setFloat32(o + 9, c.z, true);
    o += 13;
    for (const q of [c.qx, c.qy, c.qz, c.qw]) {
      v.setInt16(o, clamp16(q * Q_SCALE), true);
      o += 2;
    }
    for (const vel of [c.vx, c.vy, c.vz]) {
      v.setInt16(o, clamp16(vel * V_SCALE), true);
      o += 2;
    }
    v.setFloat32(o, c.distance, true);
    v.setUint8(o + 4, c.laps);
    v.setUint8(o + 5, c.flags);
  });
  return buf;
}

export function decodeSnapshot(buf: ArrayBuffer): Snapshot | null {
  if (buf.byteLength < HEADER_BYTES) return null;
  const v = new DataView(buf);
  if (v.getUint8(0) !== VERSION) return null;
  const count = v.getUint8(3);
  if (buf.byteLength < HEADER_BYTES + count * CAR_BYTES) return null;
  const cars: CarState[] = [];
  for (let i = 0; i < count; i++) {
    let o = HEADER_BYTES + i * CAR_BYTES;
    const netId = v.getUint8(o);
    const x = v.getFloat32(o + 1, true);
    const y = v.getFloat32(o + 5, true);
    const z = v.getFloat32(o + 9, true);
    o += 13;
    const q: number[] = [];
    for (let k = 0; k < 4; k++, o += 2) q.push(v.getInt16(o, true) / Q_SCALE);
    const vel: number[] = [];
    for (let k = 0; k < 3; k++, o += 2) vel.push(v.getInt16(o, true) / V_SCALE);
    cars.push({
      netId, x, y, z,
      qx: q[0], qy: q[1], qz: q[2], qw: q[3],
      vx: vel[0], vy: vel[1], vz: vel[2],
      distance: v.getFloat32(o, true),
      laps: v.getUint8(o + 4),
      flags: v.getUint8(o + 5),
    });
  }
  return { slot: v.getUint8(1), raceSeq: v.getUint8(2), time: v.getFloat32(4, true), cars };
}

export const normalizeCode = (raw: string) => raw.trim().toUpperCase();

/** Strips control characters and clamps to NICK_MAX; null if nothing is left. */
export function cleanNick(raw: string): string | null {
  const nick = raw.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim().slice(0, NICK_MAX).trim();
  return nick.length > 0 ? nick : null;
}
