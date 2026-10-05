import {
  FINISH_CUTOFF_MS,
  LOAD_TIMEOUT_MS,
  MAX_HUMANS,
  LOBBY_GRACE_MS,
  QUICK_WAIT_MS,
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
import { TRACKS, trackById, trackFor } from '../src/config/tracks';
import { paintOf, vehicleById, type VehicleId } from '../src/config/vehicles';
import { Roster, type BotView } from './bots';
import { buildGrid, buildQuickGrid } from './grid';
import { Referee } from './referee';

export type Send = (conn: number, msg: ServerMessage) => void;

type Member = {
  slot: number;
  name: string;
  vehicle: VehicleId;
  /** Always one of the vehicle's own paint ids. */
  paint: string;
  ready: boolean;
  token: string;
  /** Null while disconnected and waiting out the reconnect grace. */
  conn: number | null;
  leftAt: number | null;
  /** How long the seat is kept from leftAt: longer if the drop happened in the lobby. */
  grace: number;
};

export type LobbyChange = { vehicle?: VehicleId; paint?: string; ready?: boolean; fillAI?: boolean };

/** The paint id if the vehicle has it, else the vehicle's usual colour. */
const paintFor = (vehicle: VehicleId, paint: string | undefined) => paintOf(vehicleById(vehicle), paint).id;

export type RoomOptions = {
  /** A Quick race room: no host, the server runs the timer, the track vote and the start, and bots fill the grid. */
  quick?: boolean;
  random?: () => number;
  /** Server time, for what the room shows between ticks (the countdown and the bots that have appeared). */
  clock?: () => number;
};

/** Every track's vote count (0 included), from each human's latest vote. */
function tally(votes: Map<number, string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of TRACKS) out[t.id] = 0;
  for (const id of votes.values()) out[id]++;
  return out;
}

/** The most-voted track; a tie, or no votes at all, is settled at random among the tied tracks (or all of them). */
function pickTrack(votes: Map<number, string>, random: () => number): string {
  const counts = tally(votes);
  const top = Math.max(...Object.values(counts));
  const tied = TRACKS.map(t => t.id).filter(id => counts[id] === top);
  return tied[Math.min(tied.length - 1, Math.floor(random() * tied.length))];
}

/** One room: who is in it, who hosts, and the lobby state shared with everyone. */
export class Room {
  phase: RoomPhase = 'lobby';
  hostSlot = 0;
  fillAI = false;
  raceSeq = 0;
  lastActivity: number;
  private members = new Map<number, Member>();
  private grid: GridEntry[] = [];
  /** The current race's grid message, re-sent to a racer who resumes. */
  private gridMsg: Extract<ServerMessage, { t: 'grid' }> | null = null;
  /** The last race's results, re-sent to a racer from its grid who missed them in a drop. */
  private resultsMsg: Extract<ServerMessage, { t: 'results' }> | null = null;
  /** Cars out of the current race: their phone dropped or left, or the referee refused their finish. */
  private dropped = new Set<number>();
  /** Quick rooms: slots that took over bots from a racer who left this race. */
  private heirs = new Set<number>();
  private loaded = new Set<number>();
  private gridAt = 0;
  private startAt = 0;
  private referee: Referee | null = null;
  /** Server time the race ends regardless: FINISH_CUTOFF_MS after the first accepted finish. */
  private cutoffAt: number | null = null;

  readonly quick: boolean;
  private random: () => number;
  private clock: () => number;
  /** Quick rooms: when the race starts, set when the first human is seated. */
  private startsAt: number | null = null;
  private roster: Roster | null = null;
  /** Quick rooms: each human slot's latest track vote. */
  private votes = new Map<number, string>();
  /** Quick rooms: how many bots the last check showed, so a change is broadcast once. */
  private botsShown = 0;
  /** Quick rooms: the bots on the grid, once the race has started (a Quick room races only once). */
  private racingBots: BotView[] | null = null;

  constructor(
    readonly code: string,
    /** Set from the vote when a Quick race starts; friends' rooms keep the server default. */
    public trackId: string,
    private send: Send,
    now: number,
    options: RoomOptions = {},
  ) {
    this.lastActivity = now;
    this.quick = options.quick ?? false;
    this.random = options.random ?? Math.random;
    this.clock = options.clock ?? Date.now;
  }

  get size() {
    return this.members.size;
  }

  get isFull() {
    return this.members.size >= MAX_HUMANS;
  }

  /** At least one member's phone is connected. */
  get hasConnected() {
    return this.here().length > 0;
  }

  /** Seats a new human in the lowest free slot; the first one in becomes host. */
  add(conn: number, name: string, vehicle: VehicleId, paint: string, token: string): number {
    let slot = 1;
    while (this.members.has(slot)) slot++;
    this.members.set(slot, { slot, name, vehicle, paint: paintFor(vehicle, paint), ready: false, token, conn, leftAt: null, grace: RECONNECT_GRACE_MS });
    if (this.quick) {
      // Nobody hosts; the wait starts with the first human and later joins do not move it.
      if (this.startsAt === null) {
        const now = this.clock();
        this.startsAt = now + QUICK_WAIT_MS;
        this.roster = new Roster(this.random, now);
      }
    } else if (this.members.size === 1) this.hostSlot = slot;
    return slot;
  }

  /** The slot this token holds, unless its reconnect grace has run out. */
  slotOfToken(token: string, now: number): number | null {
    for (const m of this.members.values()) if (m.token === token && !this.expired(m, now)) return m.slot;
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
    m.grace = this.phase === 'lobby' ? LOBBY_GRACE_MS : RECONNECT_GRACE_MS;
  }

  /** Gone for good: in a race their cars are out of it at once. */
  remove(slot: number) {
    this.dropOut(slot, this.clock());
    if (!this.members.delete(slot)) return;
    this.votes.delete(slot);
    if (!this.quick && slot === this.hostSlot) this.hostSlot = this.nextHost();
  }

  /**
   * Everyone gone longer than the grace period: out of the race if one is on, and out of the room once it is back
   * in the lobby (so the race keeps their name for the results). Returns true if anyone was removed.
   */
  expire(now: number): boolean {
    let removed = false;
    for (const m of [...this.members.values()]) {
      if (!this.expired(m, now)) continue;
      if (this.phase === 'lobby') {
        this.remove(m.slot);
        removed = true;
      } else this.dropOut(m.slot, now);
    }
    return removed;
  }

  private expired(m: Member, now: number) {
    return m.leftAt !== null && now - m.leftAt >= m.grace;
  }

  /** Left the room, or away longer than the grace period. */
  private gone(slot: number, now: number) {
    const m = this.members.get(slot);
    return !m || this.expired(m, now);
  }

  /**
   * Marks this slot's cars DNF in the race under way and tells the racers. In a friends' room its AI goes out with
   * it; in a Quick room its bots pass to the next racer instead, if anyone is still connected or may come back.
   */
  private dropOut(slot: number, now: number) {
    if (this.phase === 'lobby' || !this.referee) return;
    if (this.quick) this.handOver(slot, now);
    const netIds = this.grid.filter(g => g.slot === slot && !this.dropped.has(g.netId)).map(g => g.netId);
    if (!netIds.length) return;
    for (const id of netIds) {
      this.referee.dnf(id);
      this.dropped.add(id);
    }
    for (const conn of this.othersOnGrid(slot)) this.send(conn, { t: 'dnf', netIds });
  }

  /**
   * A Quick room's bots driven by this slot become the lowest other connected racer's (`owns()` reads the grid, so
   * that phone's snapshots and finishes for them count from now on), and it is told to drive the ones still going.
   * Before the race it also gets its grid again, now showing those bots as its own. If every other racer is away
   * but inside their grace, the lowest of them takes the bots and is told when it resumes (`resync`). With nobody
   * to take them they stay put and go out with the leaver.
   */
  private handOver(slot: number, now: number) {
    const bots = this.grid.filter(g => g.ai && g.slot === slot);
    const racers = [...this.members.values()]
      .filter(m => m.slot !== slot && !this.expired(m, now) && this.grid.some(g => !g.ai && g.slot === m.slot))
      .sort((a, b) => a.slot - b.slot);
    const heir = (racers.find(m => m.conn !== null) ?? racers[0])?.slot;
    if (!bots.length || heir === undefined) return;
    for (const g of bots) g.slot = heir;
    this.heirs.add(heir);
    const conn = this.connOf(heir);
    if (conn === null) return;
    if (this.phase !== 'racing') {
      const grid = this.gridFor(heir);
      if (grid) this.send(conn, grid);
    }
    const netIds = this.adoptedBy(heir);
    if (netIds.length) this.send(conn, { t: 'adopt', netIds });
  }

  /** The still-running bots this slot was handed (none if it never took any over). */
  private adoptedBy(slot: number): number[] {
    if (!this.heirs.has(slot)) return [];
    return this.grid.filter(g => g.ai && g.slot === slot && this.referee?.running(g.netId) && !this.dropped.has(g.netId)).map(g => g.netId);
  }

  /**
   * A racer back from a drop catches up on the race: its grid, the start time if set, and who dropped out. Back in
   * the lobby, it gets the results it may have missed.
   */
  resync(slot: number) {
    const conn = this.connOf(slot);
    if (conn === null || !this.grid.some(g => g.slot === slot)) return;
    if (this.phase === 'lobby') {
      const results = this.resultsFor(slot);
      if (results) this.send(conn, results);
      return;
    }
    const grid = this.gridFor(slot);
    if (!grid) return;
    this.send(conn, grid);
    if (this.phase !== 'loading') this.send(conn, { t: 'start', raceSeq: this.raceSeq, at: this.startAt });
    if (this.dropped.size) this.send(conn, { t: 'dnf', netIds: [...this.dropped] });
    const adopted = this.adoptedBy(slot);
    if (adopted.length) this.send(conn, { t: 'adopt', netIds: adopted });
  }

  /** Applies a lobby change from a member; returns an error code if it is refused. */
  lobby(slot: number, change: LobbyChange): ErrorCode | null {
    const m = this.members.get(slot);
    if (!m) return null;
    if (change.fillAI !== undefined && (this.quick || slot !== this.hostSlot)) return 'not-host';
    // In a Quick room every connected human counts as ready; only the ride can change.
    if (this.quick) change = { vehicle: change.vehicle, paint: change.paint };
    if (change.vehicle !== undefined || change.paint !== undefined) {
      m.vehicle = change.vehicle ?? m.vehicle;
      m.paint = paintFor(m.vehicle, change.paint ?? m.paint);
    }
    if (change.ready !== undefined) m.ready = change.ready;
    if (change.fillAI !== undefined) this.fillAI = change.fillAI;
    return null;
  }

  /** Host starts the race: lines up the connected humans and tells them to load. */
  startRace(slot: number, now: number, random: () => number): ErrorCode | null {
    if (this.quick) return 'not-host';
    if (this.phase !== 'lobby') return null;
    if (slot !== this.hostSlot) return 'not-host';
    const here = this.here();
    if (here.length < 2 || here.some(m => !m.ready)) return 'not-ready';
    this.launch(buildGrid(here, this.fillAI, this.hostSlot, random), now, random);
    return null;
  }

  /** A Quick room's human votes for a track. False if refused: not a Quick lobby, not a member, or no such track. */
  vote(slot: number, trackId: string): boolean {
    if (!this.quick || this.phase !== 'lobby' || this.racingBots) return false;
    if (!this.members.has(slot) || !TRACKS.some(t => t.id === trackId)) return false;
    // The same vote again changes nothing, so there is nothing to broadcast.
    if (this.votes.get(slot) === trackId) return false;
    this.votes.set(slot, trackId);
    return true;
  }

  /**
   * A Quick room's lobby clock: tells everyone when bots appear or go, and starts the race when the wait is over or
   * the room is full of humans. Nothing happens while no human is connected.
   */
  tickQuick(now: number) {
    if (!this.quick || this.phase !== 'lobby' || this.racingBots || this.startsAt === null) return;
    const here = this.here();
    if (!here.length) return;
    // Early start only with a full grid of connected humans, the same set the grid is built from.
    if (now >= this.startsAt || here.length >= MAX_HUMANS) return this.startQuick(here, now);
    const shown = this.visibleBots(now).length;
    if (shown !== this.botsShown) {
      this.botsShown = shown;
      this.broadcastRoom();
    }
  }

  /** Races the voted track, with bots in every empty seat, all driven by the lowest connected human. */
  private startQuick(here: Member[], now: number) {
    this.trackId = pickTrack(this.votes, this.random);
    this.racingBots = this.roster!.visible(Infinity, here);
    const owner = Math.min(...here.map(m => m.slot));
    this.launch(buildQuickGrid(here, this.racingBots, owner), now, this.random);
  }

  /** The members whose phone is connected. */
  private here(): Member[] {
    return [...this.members.values()].filter(m => m.conn !== null);
  }

  /** The bots a Quick room shows: the ones that have arrived while there are seats for them, or the grid's. */
  private visibleBots(now: number): BotView[] {
    if (this.racingBots) return this.racingBots;
    return this.roster?.visible(now, [...this.members.values()]) ?? [];
  }

  /** Lines up this grid and tells the racers to load. */
  private launch(grid: GridEntry[], now: number, random: () => number) {
    const config = trackById(this.trackId);
    this.raceSeq++;
    this.grid = grid;
    this.referee = new Referee(trackFor(config), config.laps, this.grid);
    this.cutoffAt = null;
    this.resultsMsg = null;
    this.dropped.clear();
    this.heirs.clear();
    this.loaded.clear();
    this.gridAt = now;
    this.phase = 'loading';
    this.gridMsg = {
      t: 'grid',
      raceSeq: this.raceSeq,
      grid: this.grid,
      seed: Math.floor(random() * 2 ** 32),
      trackId: this.trackId,
      laps: config.laps,
    };
    for (const s of new Set(this.grid.map(g => g.slot))) {
      const conn = this.connOf(s);
      const msg = this.gridFor(s);
      if (conn !== null && msg) this.send(conn, msg);
    }
  }

  /**
   * The bot flag is secret in a Quick room: a phone sees `ai: true` only on the cars it drives itself, so nobody can
   * tell the bots from the other humans. Friends' rooms send the real flags.
   */
  private hide<T extends { ai: boolean; slot: number }>(entries: T[], slot: number): T[] {
    if (!this.quick) return entries;
    return entries.map(e => ({ ...e, ai: e.ai && e.slot === slot }));
  }

  gridFor(slot: number): Extract<ServerMessage, { t: 'grid' }> | null {
    return this.gridMsg && { ...this.gridMsg, grid: this.hide(this.gridMsg.grid, slot) };
  }

  resultsFor(slot: number): Extract<ServerMessage, { t: 'results' }> | null {
    return this.resultsMsg && { ...this.resultsMsg, results: this.hide(this.resultsMsg.results, slot) };
  }

  /** A grid human finished loading the track. Anyone else, or a repeat, is ignored. */
  markLoaded(slot: number, now: number) {
    if (this.phase !== 'loading' || !this.grid.some(g => g.slot === slot)) return;
    this.loaded.add(slot);
    this.advance(now);
  }

  /** Timers: the start, the finish cutoff, and a race everyone has walked away from. */
  tick(now: number) {
    if (this.phase === 'lobby') return this.tickQuick(now);
    // Nobody left to race or to tell: no results, just the lobby (and the room is reaped if it is empty). A racer
    // still inside the reconnect grace may yet come back, so a blip never ends the race.
    if (this.grid.every(g => this.gone(g.slot, now))) return this.endRace(now, false);
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
    const at = this.raceTime(now);
    const time = Math.min(snap.time, at + 1);
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
    const open = referee.running(netId);
    const accepted = referee.finish(netId, laps, time, this.raceTime(now));
    if (accepted) {
      this.cutoffAt ??= now + FINISH_CUTOFF_MS;
      for (const conn of this.othersOnGrid(0)) this.send(conn, { t: 'finished', netId, time });
    } else if (open) {
      // Refused: the car is out, and everyone (a racer who resumes later too) should know.
      this.dropped.add(netId);
      for (const conn of this.othersOnGrid(0)) this.send(conn, { t: 'dnf', netIds: [netId] });
    }
    if (referee.allDone()) this.endRace(now, true);
    return accepted;
  }

  /**
   * Sends the results to the racers (if asked) and goes back to the lobby for a rematch, everyone unready and anyone
   * whose grace ran out during the race gone.
   */
  private endRace(now: number, withResults: boolean) {
    if (withResults && this.referee) {
      this.resultsMsg = { t: 'results', raceSeq: this.raceSeq, results: this.referee.results(this.raceTime(now)) };
      for (const s of new Set(this.grid.map(g => g.slot))) {
        const conn = this.connOf(s);
        const msg = this.resultsFor(s);
        if (conn !== null && msg) this.send(conn, msg);
      }
    }
    this.phase = 'lobby';
    this.referee = null;
    this.gridMsg = null;
    this.cutoffAt = null;
    this.expire(now);
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
      .map(m => ({ slot: m.slot, name: m.name, vehicle: m.vehicle, paint: m.paint, ready: m.ready, connected: m.conn !== null }));
    const view: RoomView = { code: this.code, phase: this.phase, hostSlot: this.hostSlot, fillAI: this.fillAI, raceSeq: this.raceSeq, players };
    if (!this.quick) return view;
    // Connected humans count as ready, and the bots look just like them, listed after the humans.
    for (const p of players) p.ready = p.connected;
    const now = this.clock();
    for (const b of this.visibleBots(now)) players.push({ ...b, ready: true, connected: true });
    const startsInMs = this.racingBots ? 0 : this.startsAt === null ? QUICK_WAIT_MS : Math.max(0, this.startsAt - now);
    return { ...view, hostSlot: 0, quick: { startsInMs, votes: tally(this.votes) } };
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
