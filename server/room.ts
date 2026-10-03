import {
  MAX_HUMANS,
  RECONNECT_GRACE_MS,
  type ErrorCode,
  type PlayerInfo,
  type RoomPhase,
  type RoomView,
  type ServerMessage,
} from '../src/net/protocol';
import type { VehicleId } from '../src/config/vehicles';

export type Send = (conn: number, msg: ServerMessage) => void;

type Member = {
  slot: number;
  name: string;
  vehicle: VehicleId;
  ready: boolean;
  token: string;
  /** Null while disconnected and waiting out the reconnect grace. */
  conn: number | null;
  leftAt: number | null;
};

export type LobbyChange = { vehicle?: VehicleId; ready?: boolean; fillAI?: boolean };

/** One room: who is in it, who hosts, and the lobby state shared with everyone. */
export class Room {
  phase: RoomPhase = 'lobby';
  hostSlot = 0;
  fillAI = false;
  raceSeq = 0;
  lastActivity: number;
  private members = new Map<number, Member>();

  constructor(
    readonly code: string,
    readonly trackId: string,
    private send: Send,
    now: number,
  ) {
    this.lastActivity = now;
  }

  get size() {
    return this.members.size;
  }

  get isFull() {
    return this.members.size >= MAX_HUMANS;
  }

  /** Seats a new human in the lowest free slot; the first one in becomes host. */
  add(conn: number, name: string, vehicle: VehicleId, token: string): number {
    let slot = 1;
    while (this.members.has(slot)) slot++;
    this.members.set(slot, { slot, name, vehicle, ready: false, token, conn, leftAt: null });
    if (this.members.size === 1) this.hostSlot = slot;
    return slot;
  }

  slotOfToken(token: string): number | null {
    for (const m of this.members.values()) if (m.token === token) return m.slot;
    return null;
  }

  tokenOf(slot: number) {
    return this.members.get(slot)?.token ?? '';
  }

  connOf(slot: number) {
    return this.members.get(slot)?.conn ?? null;
  }

  conns(): number[] {
    const out: number[] = [];
    for (const m of this.members.values()) if (m.conn !== null) out.push(m.conn);
    return out;
  }

  attach(slot: number, conn: number) {
    const m = this.members.get(slot);
    if (!m) return;
    m.conn = conn;
    m.leftAt = null;
  }

  /** Keeps the slot for the reconnect grace period. */
  detach(slot: number, now: number) {
    const m = this.members.get(slot);
    if (!m) return;
    m.conn = null;
    m.leftAt = now;
  }

  remove(slot: number) {
    if (!this.members.delete(slot)) return;
    if (slot === this.hostSlot) this.hostSlot = this.nextHost();
  }

  /** Removes everyone who has been gone longer than the grace period. */
  expire(now: number): boolean {
    let removed = false;
    for (const m of [...this.members.values()]) {
      if (m.leftAt !== null && now - m.leftAt >= RECONNECT_GRACE_MS) {
        this.remove(m.slot);
        removed = true;
      }
    }
    return removed;
  }

  /** Applies a lobby change from a member; returns an error code if it is refused. */
  lobby(slot: number, change: LobbyChange): ErrorCode | null {
    const m = this.members.get(slot);
    if (!m) return null;
    if (change.fillAI !== undefined && slot !== this.hostSlot) return 'not-host';
    if (change.vehicle !== undefined) m.vehicle = change.vehicle;
    if (change.ready !== undefined) m.ready = change.ready;
    if (change.fillAI !== undefined) this.fillAI = change.fillAI;
    return null;
  }

  view(): RoomView {
    const players: PlayerInfo[] = [...this.members.values()]
      .sort((a, b) => a.slot - b.slot)
      .map(m => ({ slot: m.slot, name: m.name, vehicle: m.vehicle, ready: m.ready, connected: m.conn !== null }));
    return { code: this.code, phase: this.phase, hostSlot: this.hostSlot, fillAI: this.fillAI, raceSeq: this.raceSeq, players };
  }

  broadcast(msg: ServerMessage) {
    for (const conn of this.conns()) this.send(conn, msg);
  }

  broadcastRoom() {
    this.broadcast({ t: 'room', room: this.view() });
  }

  /** Lowest connected slot, or failing that the lowest slot still held. */
  private nextHost(): number {
    let connected = 0;
    let first = 0;
    for (const m of [...this.members.values()].sort((a, b) => a.slot - b.slot)) {
      if (!first) first = m.slot;
      if (!connected && m.conn !== null) connected = m.slot;
    }
    return connected || first;
  }
}
