import {
  FINISH_CUTOFF_MS,
  LOAD_TIMEOUT_MS,
  MAX_HUMANS,
  RECONNECT_GRACE_MS,
  START_LEAD_MS,
  type ClientMessage,
  type ErrorCode,
  type GridEntry,
  type PlayerInfo,
  type RoomPhase,
  type RoomView,
  type ServerMessage,
  type Snapshot,
} from '../src/net/protocol';
import { trackById } from '../src/config/tracks';
import type { VehicleId } from '../src/config/vehicles';
import { buildTrack } from '../src/game/track';
import { buildGrid } from './grid';
import { Referee } from './referee';

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
  private grid: GridEntry[] = [];
  private loaded = new Set<number>();
  private gridAt = 0;
  private startAt = 0;
  private referee: Referee | null = null;
  /** Server time the race ends regardless: FINISH_CUTOFF_MS after the first accepted finish. */
  private cutoffAt: number | null = null;

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

  /** Host starts the race: lines up the connected humans and tells them to load. */
  startRace(slot: number, now: number, random: () => number): ErrorCode | null {
    if (this.phase !== 'lobby') return null;
    if (slot !== this.hostSlot) return 'not-host';
    const here = [...this.members.values()].filter(m => m.conn !== null);
    if (here.length < 2 || here.some(m => !m.ready)) return 'not-ready';

    const config = trackById(this.trackId);
    this.raceSeq++;
    this.grid = buildGrid(here, this.fillAI, this.hostSlot, random);
    this.referee = new Referee(buildTrack(config.control, 2, config.hills), config.laps, this.grid);
    this.cutoffAt = null;
    this.loaded.clear();
    this.gridAt = now;
    this.phase = 'loading';
    this.broadcast({
      t: 'grid',
      raceSeq: this.raceSeq,
      grid: this.grid,
      seed: Math.floor(random() * 2 ** 32),
      trackId: this.trackId,
      laps: config.laps,
    });
    return null;
  }

  /** A grid human finished loading the track. Anyone else, or a repeat, is ignored. */
  markLoaded(slot: number, now: number) {
    if (this.phase !== 'loading' || !this.grid.some(g => g.slot === slot)) return;
    this.loaded.add(slot);
    this.advance(now);
  }

  /** Timers: the start, the finish cutoff, and a race everyone has walked away from. */
  tick(now: number) {
    if (this.phase === 'lobby') return;
    // Nobody left to race or to tell: no results, just the lobby (and the room is reaped if it is empty).
    if (this.grid.every(g => this.connOf(g.slot) === null)) return this.endRace(now, false);
    this.advance(now);
    if (this.phase === 'racing' && (this.referee?.allDone() || (this.cutoffAt !== null && now >= this.cutoffAt))) this.endRace(now, true);
  }

  /** Moves loading to countdown and countdown to racing as their conditions are met. */
  advance(now: number) {
    if (this.phase === 'loading') {
      // Anyone who is gone never holds up the start.
      const waiting = this.grid.some(g => !this.loaded.has(g.slot) && this.connOf(g.slot) !== null);
      if (waiting && now - this.gridAt < LOAD_TIMEOUT_MS) return;
      this.startAt = now + START_LEAD_MS;
      this.phase = 'countdown';
      this.broadcast({ t: 'start', raceSeq: this.raceSeq, at: this.startAt });
    } else if (this.phase === 'countdown' && now >= this.startAt) {
      this.phase = 'racing';
    }
  }

  /**
   * Who should receive this snapshot: the other connected racers, or null if it must be dropped.
   * Only a grid human may send, only in countdown or racing, only for the current race and only for their own cars.
   */
  snapshotTargets(snap: Snapshot): number[] | null {
    if (this.phase !== 'countdown' && this.phase !== 'racing') return null;
    if (snap.raceSeq !== (this.raceSeq & 255)) return null;
    if (!this.grid.some(g => g.slot === snap.slot)) return null;
    if (!Number.isFinite(snap.time)) return null;
    for (const car of snap.cars) {
      if (!this.owns(snap.slot, car.netId)) return null;
      if (![car.x, car.y, car.z, car.qx, car.qy, car.qz, car.qw, car.vx, car.vy, car.vz, car.distance].every(Number.isFinite)) return null;
    }
    return this.othersOnGrid(snap.slot);
  }

  /**
   * Who should hear about this pickup, throw or hit, or null if it must be dropped. Only while racing, only from
   * a grid human, hazards only from the sender's id block and cars, and hits only on the sender's own cars.
   */
  eventTargets(slot: number, m: Extract<ClientMessage, { t: 'pickup' | 'use' | 'hit' }>): number[] | null {
    if (this.phase !== 'racing' || !this.grid.some(g => g.slot === slot)) return null;
    if (m.t === 'use') {
      const h = m.hazard;
      if (h.id < slot * 100000 || h.id >= (slot + 1) * 100000 || !this.owns(slot, h.owner)) return null;
      if (h.target !== null && !this.grid.some(g => g.netId === h.target)) return null;
    } else if (m.t === 'hit' && !this.owns(slot, m.netId)) return null;
    return this.othersOnGrid(slot);
  }

  /** A relayed snapshot's cars, as the referee sees them. A phone's clock may not run ahead of the room's. */
  observe(snap: Snapshot, now: number) {
    const time = Math.min(snap.time, this.raceTime(now) + 1);
    for (const car of snap.cars) this.referee?.observe(car, time);
  }

  /** Seconds since the green light, by the server's clock. */
  private raceTime(now: number) {
    return (now - this.startAt) / 1000;
  }

  /**
   * A racer says one of its cars crossed the line for the last time. Returns true only if the referee accepted it;
   * claims outside the race, for a car the sender does not drive, or with the wrong number of laps are not even read.
   */
  finish(slot: number, netId: number, laps: number[], time: number, now: number): boolean {
    const referee = this.referee;
    if (this.phase !== 'racing' || !referee || !this.owns(slot, netId)) return false;
    if (laps.length !== trackById(this.trackId).laps) return false;
    const accepted = referee.finish(netId, laps, time, this.raceTime(now));
    if (accepted) {
      this.cutoffAt ??= now + FINISH_CUTOFF_MS;
      for (const conn of this.othersOnGrid(0)) this.send(conn, { t: 'finished', netId, time });
    }
    if (referee.allDone()) this.endRace(now, true);
    return accepted;
  }

  /** Sends the results to the racers (if asked) and goes back to the lobby for a rematch, everyone unready. */
  private endRace(now: number, withResults: boolean) {
    if (withResults && this.referee) {
      const results = this.referee.results(this.raceTime(now));
      for (const conn of this.othersOnGrid(0)) this.send(conn, { t: 'results', raceSeq: this.raceSeq, results });
    }
    this.phase = 'lobby';
    this.referee = null;
    this.cutoffAt = null;
    for (const m of this.members.values()) m.ready = false;
    this.broadcastRoom();
  }

  private owns(slot: number, netId: number) {
    return this.grid.some(g => g.netId === netId && g.slot === slot);
  }

  /** Connections of the grid humans other than this slot (0 for all of them). */
  private othersOnGrid(slot: number): number[] {
    const out: number[] = [];
    for (const s of new Set(this.grid.map(g => g.slot))) {
      const conn = this.connOf(s);
      if (s !== slot && conn !== null) out.push(conn);
    }
    return out;
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
