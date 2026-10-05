import { randomBytes } from 'node:crypto';
import {
  CODE_ALPHABET,
  MAX_MESSAGE_BYTES,
  MAX_QUICK_ROOMS,
  RATE_LIMIT_PER_S,
  ROOM_IDLE_MS,
  LOBBY_SILENCE_MS,
  SILENCE_MS,
  UNSEATED_MS,
  cleanNick,
  decodeSnapshot,
  normalizeCode,
  type ClientMessage,
  type ErrorCode,
  type ServerMessage,
} from '../src/net/protocol';
import type { Hazard } from '../src/game/runtime';
import type { VehicleId } from '../src/config/vehicles';
import { TRACKS } from '../src/config/tracks';
import { Room, type LobbyChange } from './room';

export interface Peer {
  send(data: string | ArrayBuffer): void;
  /** `dead`: the other end has gone quiet, so do not wait on a closing handshake. */
  close(dead?: boolean): void;
}

type Handled = Extract<ClientMessage, { t: 'create' | 'join' | 'quick' | 'vote' | 'resume' | 'ping' | 'lobby' | 'leave' | 'start' | 'loaded' | 'pickup' | 'use' | 'hit' | 'finish' }>;

/** One second's count of JSON messages. */
type Budget = { start: number; count: number };

/**
 * Snapshots get a token bucket instead: a socket that stalled for a few seconds delivers them all at once, and the
 * referee needs every one to see the car reach the line. A steady flood is still held to 30 a second.
 */
type Bucket = { tokens: number; at: number };
const SNAPSHOT_BURST = 150;

type Conn = {
  peer: Peer;
  room: Room | null;
  slot: number;
  snapshots: Bucket;
  messages: Budget;
  openedAt: number;
  lastHeard: number;
  /** Has ever created, joined or resumed a seat. */
  seated: boolean;
};

// Record keeps this list exhaustive when a vehicle is added.
const VEHICLE_IDS: Record<VehicleId, true> = { okada: true, keke: true, danfo: true, brt: true };

const CODE_SPACE = CODE_ALPHABET.length ** 4;

const isVehicle = (v: unknown): v is VehicleId => typeof v === 'string' && Object.hasOwn(VEHICLE_IDS, v);
// A paint the vehicle doesn't have is swapped for its usual colour by the room, so only the shape is checked here.
const PAINT_MAX = 24;
const isPaint = (v: unknown): v is string => typeof v === 'string' && v.length <= PAINT_MAX;
/** Missing (an older client) means the usual colour; anything else malformed refuses the message. */
const paintIn = (v: unknown): string | null => (v === undefined ? '' : isPaint(v) ? v : null);

const HAZARD_NUMBERS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'life', 'armed', 'ground'] as const;
// A relayed hazard may not outlive or out-wait these (s), nor sit or fly outside these (m, m/s).
const HAZARD_LIFE = 22;
const HAZARD_ARMED = 2;
const HAZARD_REACH = 5000;
const HAZARD_HEIGHT = 500;
const HAZARD_SPEED = 200;

/** A well-formed hazard, rebuilt field by field so nothing extra is relayed. Who may send it is the room's call. */
function parseHazard(v: unknown): Hazard | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (!Number.isInteger(o.id) || !Number.isInteger(o.owner)) return null;
  if (o.kind !== 'oil' && o.kind !== 'juju') return null;
  if (o.target !== null && !Number.isInteger(o.target)) return null;
  if (!HAZARD_NUMBERS.every(k => typeof o[k] === 'number' && Number.isFinite(o[k]))) return null;
  const n = o as Record<(typeof HAZARD_NUMBERS)[number], number>;
  // Nowhere near a track, or faster than anything can be thrown.
  if (Math.abs(n.x) > HAZARD_REACH || Math.abs(n.z) > HAZARD_REACH || Math.abs(n.y) > HAZARD_HEIGHT) return null;
  if (Math.hypot(n.vx, n.vy, n.vz) > HAZARD_SPEED) return null;
  return {
    id: o.id as number, kind: o.kind, owner: o.owner as number, target: o.target as number | null,
    x: n.x, y: n.y, z: n.z, vx: n.vx, vy: n.vy, vz: n.vz,
    life: Math.min(n.life, HAZARD_LIFE), armed: Math.min(n.armed, HAZARD_ARMED), ground: n.ground,
  };
}

function parse(raw: string): Handled | null {
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof m !== 'object' || m === null || Array.isArray(m)) return null;
  const o = m as Record<string, unknown>;
  switch (o.t) {
    case 'create': {
      const paint = paintIn(o.paint);
      return typeof o.name === 'string' && isVehicle(o.vehicle) && paint !== null ? { t: 'create', name: o.name, vehicle: o.vehicle, paint } : null;
    }
    case 'quick': {
      const paint = paintIn(o.paint);
      return typeof o.name === 'string' && isVehicle(o.vehicle) && paint !== null ? { t: 'quick', name: o.name, vehicle: o.vehicle, paint } : null;
    }
    case 'vote':
      return typeof o.trackId === 'string' && o.trackId.length <= 40 ? { t: 'vote', trackId: o.trackId } : null;
    case 'join': {
      const paint = paintIn(o.paint);
      return typeof o.code === 'string' && typeof o.name === 'string' && isVehicle(o.vehicle) && paint !== null
        ? { t: 'join', code: o.code, name: o.name, vehicle: o.vehicle, paint }
        : null;
    }
    case 'resume':
      return typeof o.token === 'string' ? { t: 'resume', token: o.token } : null;
    case 'ping':
      return typeof o.c === 'number' && Number.isFinite(o.c) ? { t: 'ping', c: o.c } : null;
    case 'lobby': {
      const { vehicle, paint, ready, fillAI } = o;
      if (vehicle !== undefined && !isVehicle(vehicle)) return null;
      if (paint !== undefined && !isPaint(paint)) return null;
      if (ready !== undefined && typeof ready !== 'boolean') return null;
      if (fillAI !== undefined && typeof fillAI !== 'boolean') return null;
      return { t: 'lobby', vehicle, paint, ready, fillAI };
    }
    case 'leave':
      return { t: 'leave' };
    case 'start':
      return { t: 'start' };
    case 'loaded':
      return { t: 'loaded' };
    case 'pickup':
      return Number.isInteger(o.orb) && (o.orb as number) >= 0 ? { t: 'pickup', orb: o.orb as number } : null;
    case 'use': {
      const hazard = parseHazard(o.hazard);
      return hazard ? { t: 'use', hazard } : null;
    }
    case 'hit':
      return Number.isInteger(o.hazard) && Number.isInteger(o.netId) ? { t: 'hit', hazard: o.hazard as number, netId: o.netId as number } : null;
    case 'finish': {
      const { netId, laps, time } = o;
      if (!Number.isInteger(netId) || typeof time !== 'number' || !Number.isFinite(time) || !Array.isArray(laps)) return null;
      if (!laps.every(t => typeof t === 'number' && Number.isFinite(t) && t > 0)) return null;
      return { t: 'finish', netId: netId as number, laps: [...laps] as number[], time };
    }
    default:
      return null;
  }
}

/** Connections, message routing, room codes, resume tokens and abuse limits. */
export class RoomServer {
  readonly rooms = new Map<string, Room>();
  private conns = new Map<number, Conn>();
  private nextConn = 1;
  private now: () => number;
  private random: () => number;
  private trackId: string;
  private liveness: boolean;

  /** liveness is only turned off by tests that jump the clock without pinging. */
  constructor(opts: { now?: () => number; random?: () => number; trackId?: string; liveness?: boolean } = {}) {
    this.now = opts.now ?? Date.now;
    this.random = opts.random ?? Math.random;
    this.trackId = opts.trackId ?? TRACKS[0].id;
    this.liveness = opts.liveness ?? true;
  }

  open(peer: Peer): number {
    const id = this.nextConn++;
    const now = this.now();
    this.conns.set(id, {
      peer, room: null, slot: 0, snapshots: { tokens: SNAPSHOT_BURST, at: now }, messages: { start: now, count: 0 },
      openedAt: now, lastHeard: now, seated: false,
    });
    return id;
  }

  message(conn: number, data: string | ArrayBuffer) {
    const c = this.conns.get(conn);
    if (!c) return;
    c.lastHeard = this.now();
    const bytes = typeof data === 'string' ? (data.length > MAX_MESSAGE_BYTES ? Infinity : Buffer.byteLength(data)) : data.byteLength;
    // A burst of buffered snapshots must not use up the budget for the finish that follows it.
    if (bytes > MAX_MESSAGE_BYTES) return;
    if (typeof data === 'string' ? !this.withinRate(c.messages) : !this.takeToken(c.snapshots)) return;
    if (typeof data !== 'string') return this.relay(c, data);
    const m = parse(data);
    if (!m) return;

    if (m.t === 'ping') return this.send(conn, { t: 'pong', c: m.c, s: this.now() });
    if (m.t === 'create' || m.t === 'join' || m.t === 'quick' || m.t === 'resume') {
      if (c.room) return;
      if (m.t === 'create') this.create(conn, c, m.name, m.vehicle, m.paint);
      else if (m.t === 'quick') this.quick(conn, c, m.name, m.vehicle, m.paint);
      else if (m.t === 'join') this.join(conn, c, m.code, m.name, m.vehicle, m.paint);
      else this.resume(conn, c, m.token);
      return;
    }

    const room = c.room;
    if (!room) return;
    if (m.t === 'pickup' || m.t === 'use' || m.t === 'hit') return this.relayEvent(c, room, m);
    if (m.t === 'finish') {
      if (room.finish(c.slot, m.netId, m.laps, m.time, this.now())) room.lastActivity = this.now();
      return;
    }
    room.lastActivity = this.now();
    if (m.t === 'vote') {
      if (room.vote(c.slot, m.trackId)) room.broadcastRoom();
      return;
    }
    if (m.t === 'leave') this.leave(c, room);
    else if (m.t === 'lobby') this.lobby(conn, c, room, m);
    else if (m.t === 'start') this.start(conn, c, room);
    else if (m.t === 'loaded') room.markLoaded(c.slot, this.now());
  }

  close(conn: number) {
    const c = this.conns.get(conn);
    if (!c) return;
    this.conns.delete(conn);
    if (!c.room) return;
    c.room.detach(c.slot, this.now());
    c.room.broadcastRoom();
  }

  tick() {
    const now = this.now();
    // A phone that vanished without a close (mobile data gone) is only noticed by its silence.
    for (const [id, c] of this.conns) {
      if (!this.liveness) break;
      // A phone in the lobby may be off sharing the link; in a race, silence means the link is gone.
      const silence = c.room?.phase === 'lobby' ? LOBBY_SILENCE_MS : SILENCE_MS;
      if (now - c.lastHeard < silence && (c.seated || now - c.openedAt < UNSEATED_MS)) continue;
      c.peer.close(true);
      this.close(id);
    }
    for (const [code, room] of this.rooms) {
      const changed = room.expire(now);
      if (room.size === 0) this.rooms.delete(code);
      else if (now - room.lastActivity >= ROOM_IDLE_MS) this.dispose(code, room);
      else {
        if (changed) room.broadcastRoom();
        room.tick(now);
      }
    }
  }

  private takeToken(b: Bucket): boolean {
    const now = this.now();
    b.tokens = Math.min(SNAPSHOT_BURST, b.tokens + ((now - b.at) / 1000) * RATE_LIMIT_PER_S);
    b.at = now;
    if (b.tokens < 1) return false;
    b.tokens--;
    return true;
  }

  private withinRate(b: Budget): boolean {
    const now = this.now();
    if (now - b.start >= 1000) {
      b.start = now;
      b.count = 0;
    }
    return ++b.count <= RATE_LIMIT_PER_S;
  }

  /** Forwards a valid car snapshot, untouched, to the other racers, and shows it to the referee. */
  private relay(c: Conn, data: ArrayBuffer) {
    const room = c.room;
    if (!room) return;
    const snap = decodeSnapshot(data);
    if (!snap || snap.slot !== c.slot) return;
    const targets = room.snapshotTargets(snap);
    if (!targets) return;
    room.lastActivity = this.now();
    room.observe(snap, this.now());
    for (const id of targets) this.conns.get(id)?.peer.send(data);
  }

  /** Passes a valid pickup, throw or hit on to the other racers, saying who sent it. */
  private relayEvent(c: Conn, room: Room, m: Extract<Handled, { t: 'pickup' | 'use' | 'hit' }>) {
    const targets = room.eventTargets(c.slot, m);
    if (!targets) return;
    room.lastActivity = this.now();
    const msg: ServerMessage = { ...m, from: c.slot };
    for (const id of targets) this.send(id, msg);
  }

  private send(conn: number, msg: ServerMessage) {
    this.conns.get(conn)?.peer.send(JSON.stringify(msg));
  }

  private fail(conn: number, error: ErrorCode) {
    this.send(conn, { t: 'error', error });
  }

  private newRoom(quick = false): Room | null {
    const start = Math.floor(this.random() * CODE_SPACE) % CODE_SPACE;
    for (let i = 0; i < CODE_SPACE; i++) {
      let n = (start + i) % CODE_SPACE;
      let code = '';
      for (let k = 0; k < 4; k++) {
        code += CODE_ALPHABET[n % CODE_ALPHABET.length];
        n = Math.floor(n / CODE_ALPHABET.length);
      }
      if (!this.rooms.has(code)) {
        const room = new Room(code, this.trackId, (to, msg) => this.send(to, msg), this.now(), quick ? { quick: true, random: this.random, clock: this.now } : {});
        this.rooms.set(code, room);
        return room;
      }
    }
    return null;
  }

  private seat(conn: number, c: Conn, room: Room, name: string, vehicle: VehicleId, paint: string) {
    const token = randomBytes(18).toString('base64url');
    c.room = room;
    c.seated = true;
    c.slot = room.add(conn, name, vehicle, paint, token);
    this.send(conn, { t: 'welcome', code: room.code, slot: c.slot, token });
    room.broadcastRoom();
  }

  private create(conn: number, c: Conn, rawName: string, vehicle: VehicleId, paint: string) {
    const name = cleanNick(rawName);
    if (!name) return this.fail(conn, 'bad-name');
    const room = this.newRoom();
    if (!room) return;
    this.seat(conn, c, room, name, vehicle, paint);
  }

  /** Seats the player in the Quick room that starts soonest and still has a seat, or opens a new one. */
  private quick(conn: number, c: Conn, rawName: string, vehicle: VehicleId, paint: string) {
    const name = cleanNick(rawName);
    if (!name) return this.fail(conn, 'bad-name');
    let best: Room | null = null;
    let bestLeft = Infinity;
    let quickRooms = 0;
    for (const room of this.rooms.values()) {
      if (!room.quick) continue;
      quickRooms++;
      // A Quick room races once, so one that has started (or ever raced) is never offered to a newcomer.
      if (room.phase !== 'lobby' || room.raceSeq !== 0 || room.isFull) continue;
      const left = room.view().quick?.startsInMs ?? Infinity;
      if (left < bestLeft) {
        best = room;
        bestLeft = left;
      }
    }
    if (!best) {
      if (quickRooms >= MAX_QUICK_ROOMS) return this.fail(conn, 'busy');
      best = this.newRoom(true);
      if (!best) return this.fail(conn, 'busy');
    }
    best.lastActivity = this.now();
    this.seat(conn, c, best, name, vehicle, paint);
  }

  private join(conn: number, c: Conn, rawCode: string, rawName: string, vehicle: VehicleId, paint: string) {
    const code = normalizeCode(rawCode);
    if (!/^[A-Z]{4}$/.test(code)) return this.fail(conn, 'bad-code');
    const room = this.rooms.get(code);
    // Quick rooms are not joinable by code; their players come through quick().
    if (!room || room.quick) return this.fail(conn, 'not-found');
    const name = cleanNick(rawName);
    if (!name) return this.fail(conn, 'bad-name');
    if (room.isFull) return this.fail(conn, 'full');
    if (room.phase !== 'lobby') return this.fail(conn, 'started');
    room.lastActivity = this.now();
    this.seat(conn, c, room, name, vehicle, paint);
  }

  private resume(conn: number, c: Conn, token: string) {
    for (const room of this.rooms.values()) {
      const slot = room.slotOfToken(token, this.now());
      if (slot === null) continue;
      // The old socket may not have noticed it dropped yet; the new one takes over.
      const old = room.connOf(slot);
      const oldConn = old === null ? undefined : this.conns.get(old);
      if (oldConn) {
        oldConn.room = null;
        oldConn.peer.close();
      }
      room.attach(slot, conn);
      room.lastActivity = this.now();
      c.room = room;
      c.seated = true;
      c.slot = slot;
      this.send(conn, { t: 'welcome', code: room.code, slot, token });
      room.broadcastRoom();
      room.resync(slot);
      return;
    }
    this.fail(conn, 'expired');
  }

  private leave(c: Conn, room: Room) {
    room.remove(c.slot);
    c.room = null;
    if (room.size === 0) this.rooms.delete(room.code);
    else room.broadcastRoom();
  }

  private lobby(conn: number, c: Conn, room: Room, m: LobbyChange) {
    if (room.phase !== 'lobby') return;
    const error = room.lobby(c.slot, m);
    if (error) this.fail(conn, error);
    else room.broadcastRoom();
  }

  private start(conn: number, c: Conn, room: Room) {
    const error = room.startRace(c.slot, this.now(), this.random);
    if (error) this.fail(conn, error);
  }

  /** Closes everyone still connected and forgets the room. */
  private dispose(code: string, room: Room) {
    for (const id of room.conns()) {
      const c = this.conns.get(id);
      if (!c) continue;
      c.room = null;
      c.peer.close();
    }
    this.rooms.delete(code);
  }
}
