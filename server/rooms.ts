import { randomBytes } from 'node:crypto';
import {
  CODE_ALPHABET,
  MAX_MESSAGE_BYTES,
  RATE_LIMIT_PER_S,
  ROOM_IDLE_MS,
  cleanNick,
  normalizeCode,
  type ClientMessage,
  type ErrorCode,
  type ServerMessage,
} from '../src/net/protocol';
import type { VehicleId } from '../src/config/vehicles';
import { Room, type LobbyChange } from './room';

export interface Peer {
  send(data: string | ArrayBuffer): void;
  close(): void;
}

type Handled = Extract<ClientMessage, { t: 'create' | 'join' | 'resume' | 'ping' | 'lobby' | 'leave' }>;

type Conn = {
  peer: Peer;
  room: Room | null;
  slot: number;
  windowStart: number;
  windowCount: number;
};

// Record keeps this list exhaustive when a vehicle is added.
const VEHICLE_IDS: Record<VehicleId, true> = { okada: true, 'okada-blue': true, keke: true, danfo: true, 'brt-blue': true, 'brt-red': true };

const CODE_SPACE = CODE_ALPHABET.length ** 4;

const isVehicle = (v: unknown): v is VehicleId => typeof v === 'string' && Object.hasOwn(VEHICLE_IDS, v);

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
    case 'create':
      return typeof o.name === 'string' && isVehicle(o.vehicle) ? { t: 'create', name: o.name, vehicle: o.vehicle } : null;
    case 'join':
      return typeof o.code === 'string' && typeof o.name === 'string' && isVehicle(o.vehicle)
        ? { t: 'join', code: o.code, name: o.name, vehicle: o.vehicle }
        : null;
    case 'resume':
      return typeof o.token === 'string' ? { t: 'resume', token: o.token } : null;
    case 'ping':
      return typeof o.c === 'number' && Number.isFinite(o.c) ? { t: 'ping', c: o.c } : null;
    case 'lobby': {
      const { vehicle, ready, fillAI } = o;
      if (vehicle !== undefined && !isVehicle(vehicle)) return null;
      if (ready !== undefined && typeof ready !== 'boolean') return null;
      if (fillAI !== undefined && typeof fillAI !== 'boolean') return null;
      return { t: 'lobby', vehicle, ready, fillAI };
    }
    case 'leave':
      return { t: 'leave' };
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

  constructor(opts: { now?: () => number; random?: () => number; trackId?: string } = {}) {
    this.now = opts.now ?? Date.now;
    this.random = opts.random ?? Math.random;
    this.trackId = opts.trackId ?? 'ojuelegba';
  }

  open(peer: Peer): number {
    const id = this.nextConn++;
    this.conns.set(id, { peer, room: null, slot: 0, windowStart: this.now(), windowCount: 0 });
    return id;
  }

  message(conn: number, data: string | ArrayBuffer) {
    const c = this.conns.get(conn);
    if (!c) return;
    const bytes = typeof data === 'string' ? (data.length > MAX_MESSAGE_BYTES ? Infinity : Buffer.byteLength(data)) : data.byteLength;
    if (bytes > MAX_MESSAGE_BYTES || !this.withinRate(c)) return;
    if (typeof data !== 'string') return;
    const m = parse(data);
    if (!m) return;

    if (m.t === 'ping') return this.send(conn, { t: 'pong', c: m.c, s: this.now() });
    if (m.t === 'create' || m.t === 'join' || m.t === 'resume') {
      if (c.room) return;
      if (m.t === 'create') this.create(conn, c, m.name, m.vehicle);
      else if (m.t === 'join') this.join(conn, c, m.code, m.name, m.vehicle);
      else this.resume(conn, c, m.token);
      return;
    }

    const room = c.room;
    if (!room) return;
    room.lastActivity = this.now();
    if (m.t === 'leave') this.leave(c, room);
    else if (m.t === 'lobby') this.lobby(conn, c, room, m);
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
    for (const [code, room] of this.rooms) {
      const changed = room.expire(now);
      if (room.size === 0) this.rooms.delete(code);
      else if (now - room.lastActivity >= ROOM_IDLE_MS) this.dispose(code, room);
      else if (changed) room.broadcastRoom();
    }
  }

  private withinRate(c: Conn): boolean {
    const now = this.now();
    if (now - c.windowStart >= 1000) {
      c.windowStart = now;
      c.windowCount = 0;
    }
    return ++c.windowCount <= RATE_LIMIT_PER_S;
  }

  private send(conn: number, msg: ServerMessage) {
    this.conns.get(conn)?.peer.send(JSON.stringify(msg));
  }

  private fail(conn: number, error: ErrorCode) {
    this.send(conn, { t: 'error', error });
  }

  private newRoom(): Room | null {
    const start = Math.floor(this.random() * CODE_SPACE) % CODE_SPACE;
    for (let i = 0; i < CODE_SPACE; i++) {
      let n = (start + i) % CODE_SPACE;
      let code = '';
      for (let k = 0; k < 4; k++) {
        code += CODE_ALPHABET[n % CODE_ALPHABET.length];
        n = Math.floor(n / CODE_ALPHABET.length);
      }
      if (!this.rooms.has(code)) {
        const room = new Room(code, this.trackId, (to, msg) => this.send(to, msg), this.now());
        this.rooms.set(code, room);
        return room;
      }
    }
    return null;
  }

  private seat(conn: number, c: Conn, room: Room, name: string, vehicle: VehicleId) {
    const token = randomBytes(18).toString('base64url');
    c.room = room;
    c.slot = room.add(conn, name, vehicle, token);
    this.send(conn, { t: 'welcome', code: room.code, slot: c.slot, token });
    room.broadcastRoom();
  }

  private create(conn: number, c: Conn, rawName: string, vehicle: VehicleId) {
    const name = cleanNick(rawName);
    if (!name) return this.fail(conn, 'bad-name');
    const room = this.newRoom();
    if (!room) return;
    this.seat(conn, c, room, name, vehicle);
  }

  private join(conn: number, c: Conn, rawCode: string, rawName: string, vehicle: VehicleId) {
    const code = normalizeCode(rawCode);
    if (!/^[A-Z]{4}$/.test(code)) return this.fail(conn, 'bad-code');
    const room = this.rooms.get(code);
    if (!room) return this.fail(conn, 'not-found');
    const name = cleanNick(rawName);
    if (!name) return this.fail(conn, 'bad-name');
    if (room.isFull) return this.fail(conn, 'full');
    if (room.phase !== 'lobby') return this.fail(conn, 'started');
    room.lastActivity = this.now();
    this.seat(conn, c, room, name, vehicle);
  }

  private resume(conn: number, c: Conn, token: string) {
    for (const room of this.rooms.values()) {
      const slot = room.slotOfToken(token);
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
      c.slot = slot;
      this.send(conn, { t: 'welcome', code: room.code, slot, token });
      room.broadcastRoom();
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
