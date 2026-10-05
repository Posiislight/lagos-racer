// One room race as seen from this phone: the shared clock, the start time and what we tell the room.
import { setBodyDriven, type Hazard, type NetHooks, type RaceRuntime, type Racer } from '../game/runtime';
import { botAI } from '../game/ai';
import type { Pose } from './interpolation';
import type { OnlineSetup } from '../game/setup';
import type { ClockSync } from './clock';
import type { NetLink } from './connection';
import { sfx } from '../game/audio';
import { FLAG, START_LEAD_MS, TICK_HZ, decodeSnapshot, encodeSnapshot, type CarState, type ClientMessage, type RoomView, type ServerMessage } from './protocol';

type FinishClaim = Extract<ClientMessage, { t: 'finish' }>;

// How often an unanswered finish claim goes out again (s): a stalled socket can swallow it without dropping.
const CLAIM_EVERY = 2;

export class NetSession implements NetHooks {
  readonly raceSeq: number;
  private startAt: number | null = null;
  private sentLoaded = false;
  private race: RaceRuntime | null = null;
  private lastSend = -Infinity;
  /** Cars that sounded their horn since the last send: an AI toots for one frame, which a 15 Hz send would miss. */
  private hornSince = new Set<number>();
  /** Cars out of the race because their phone dropped; kept in case the race isn't attached yet. */
  private dnf = new Set<number>();
  /** Finish claims for my cars the room hasn't answered yet; a claim made while the socket was down is lost. */
  private unanswered = new Map<number, FinishClaim>();
  private lastClaim = -Infinity;
  private gotResults = false;
  /** Bot cars the room handed to this phone (Quick race); kept in case the race isn't attached yet. */
  private adopted = new Set<number>();

  constructor(
    private readonly link: NetLink,
    private readonly clock: ClockSync,
    readonly setup: OnlineSetup & { raceSeq: number },
    private readonly flash: (message: string) => void = () => {},
  ) {
    this.raceSeq = setup.raceSeq;
  }

  attach(race: RaceRuntime) {
    race.net = this;
    this.race = race;
    this.applyDnf();
    this.applyAdopt();
  }

  /** The server's start time (its Date.now()). */
  setStart(at: number) {
    this.startAt = at;
  }

  get started() {
    return this.startAt !== null;
  }

  /** Tells the room this phone has the track up; only the first call counts. */
  loaded() {
    if (this.sentLoaded) return;
    this.sentLoaded = true;
    this.link.sendJson({ t: 'loaded' });
  }

  now() {
    if (this.startAt === null) return -START_LEAD_MS / 1000;
    return (this.clock.serverNow() - this.startAt) / 1000;
  }

  /** Every frame: once a snapshot is due, sends every car this phone drives (mine and its AIs). */
  update(race: RaceRuntime) {
    if (this.startAt === null) return;
    for (const r of race.racers) if (r.kind !== 'remote' && r.controls.horn) this.hornSince.add(r.id);
    const t = this.now();
    if (this.unanswered.size && t - this.lastClaim >= CLAIM_EVERY) this.claim();
    // Measured from the last send, not accumulated, so a long gap (backgrounded tab) is one snapshot, not a burst.
    if (t - this.lastSend < 1 / TICK_HZ) return;
    this.lastSend = t;
    const cars: CarState[] = [];
    for (const r of race.racers) {
      if (r.kind === 'remote' || !r.body) continue;
      const p = r.body.translation(), q = r.body.rotation(), v = r.body.linvel();
      cars.push({
        netId: r.id, x: p.x, y: p.y, z: p.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w, vx: v.x, vy: v.y, vz: v.z,
        distance: r.progress.distance, laps: r.progress.lapsDone,
        flags: (r.boost > 0 ? FLAG.boost : 0) | (r.slip > 0 ? FLAG.slip : 0) | (r.curse > 0 ? FLAG.curse : 0)
          | (r.wobble > 0 ? FLAG.wobble : 0) | (this.hornSince.has(r.id) ? FLAG.horn : 0) | (r.progress.finishTime !== null ? FLAG.finished : 0)
          | (r.shield > 0 ? FLAG.shield : 0),
      });
    }
    this.hornSince.clear();
    if (cars.length) this.link.sendBinary(encodeSnapshot({ slot: this.setup.mySlot, raceSeq: this.raceSeq, time: t, cars }));
  }

  /** Another phone's cars: buffer the poses for smooth drawing and copy the race state they carry. */
  onSnapshot(buf: ArrayBuffer) {
    const snap = decodeSnapshot(buf);
    if (!snap || !this.race) return;
    // The wire only carries the low byte of raceSeq.
    if (snap.raceSeq !== (this.raceSeq & 255) || snap.slot === this.setup.mySlot) return;
    const arrival = this.now();
    for (const car of snap.cars) {
      const r = this.race.racers.find(x => x.id === car.netId);
      if (!r || r.kind !== 'remote' || !r.remote) continue;
      r.remote.buffer.push(car, snap.time, arrival);
      r.progress.distance = car.distance;
      r.progress.lapsDone = car.laps;
      r.boost = car.flags & FLAG.boost ? 1 : 0;
      r.slip = car.flags & FLAG.slip ? 1 : 0;
      r.curse = car.flags & FLAG.curse ? 1 : 0;
      r.wobble = car.flags & FLAG.wobble ? 1 : 0;
      // The odeshi bubble: enough to draw it and keep oil off; the phone that drives it times it out.
      r.shield = car.flags & FLAG.shield ? 3 : 0;
      r.controls.horn = (car.flags & FLAG.horn) !== 0;
    }
  }

  /**
   * Another phone's pickup, throw, hit or finish. The victim's phone decides hits, so a hit here only
   * tidies up the hazard; the victim's slowdown or slide arrives in its snapshots.
   */
  onEvent(m: ServerMessage) {
    if (m.t === 'dnf') {
      for (const id of m.netIds) {
        this.dnf.add(id);
        // A refused finish comes back as a dnf: no point claiming it again.
        this.unanswered.delete(id);
      }
      // My own car drives on here, but the room has stopped counting it.
      if (this.race?.racers.some(r => r.isPlayer && m.netIds.includes(r.id))) this.flash('Network wahala');
      this.applyDnf();
      return;
    }
    const race = this.race;
    if (!race) return;
    if (m.t === 'pickup') {
      const orb = race.pickups.find(p => p.id === m.orb);
      if (orb) orb.respawn = 3;
    } else if (m.t === 'use') {
      if (!race.hazards.some(h => h.id === m.hazard.id)) race.hazards.push({ ...m.hazard });
    } else if (m.t === 'hit') {
      const h = race.hazards.find(x => x.id === m.hazard);
      if (!h) return;
      if (h.kind === 'juju') {
        // A shielded victim's phone reports the juju fizzling out against the odeshi.
        const blocked = (race.racers.find(r => r.id === m.netId)?.shield ?? 0) > 0;
        race.puffs.push({ x: h.x, y: h.ground, z: h.z, age: 0, color: blocked ? 'odeshi' : 'juju' });
        h.life = 0;
        // You hear your own juju land, as offline.
        if (race.racers.find(r => r.id === h.owner)?.isPlayer) sfx(blocked ? 'odeshi' : 'juju');
      } else h.life = Math.min(h.life, 8);
    } else if (m.t === 'finished') {
      // The referee accepted another phone's finish: it stops being a juju target and ranks by time.
      const r = race.racers.find(x => x.id === m.netId);
      if (r?.kind === 'remote') r.progress.finishTime = m.time;
      else this.unanswered.delete(m.netId);
    }
  }

  /**
   * Quick race: the phone driving these bot cars left, and the room gave them to this one. Each carries on from where
   * it is drawn now (pose and velocity), keeps its distance and laps, and is driven by our bot AI with a fresh skill.
   * The room may say it again (after a resume); a car we already drive is left alone.
   */
  adopt(netIds: number[]) {
    for (const id of netIds) this.adopted.add(id);
    this.applyAdopt();
  }

  private applyAdopt() {
    const race = this.race;
    if (!race || !this.adopted.size) return;
    for (const r of race.racers) {
      if (r.kind !== 'remote' || !r.remote || !this.adopted.has(r.id)) continue;
      const buffer = r.remote.buffer, b = r.body;
      const t = Math.max(0, this.now());
      r.kind = 'ai';
      r.owner = this.setup.mySlot;
      r.remote = null;
      r.ai = botAI(r.progress.lateral);
      Object.assign(r.controls, { throttle: 0, brake: 0, steer: 0, handbrake: false, useItem: false, special: false, horn: false });
      // Our finish claim needs a time per lap adding up to the finish time: the laps done on the other phone share
      // the clock so far.
      const done = r.progress.lapsDone;
      if (done > 0 && r.progress.finishTime === null) {
        r.progress.lapTimes = Array.from({ length: done }, () => t / done);
        r.progress.lapStart = t;
      }
      // Not built yet (still loading): the scene switches the body when it is.
      if (!b) continue;
      setBodyDriven(b, false);
      const pose: Pose = { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, vx: 0, vy: 0, vz: 0 };
      if (buffer.sample(buffer.renderTimeAt(this.now()), pose) === 'empty') continue;
      b.setTranslation({ x: pose.x, y: pose.y, z: pose.z }, true);
      b.setRotation({ x: pose.qx, y: pose.qy, z: pose.qz, w: pose.qw }, true);
      b.setLinvel({ x: pose.vx, y: pose.vy, z: pose.vz }, true);
      b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  /** Other phones' cars that dropped out: hidden and out of everyone's way. */
  private applyDnf() {
    for (const r of this.race?.racers ?? []) if (r.remote && this.dnf.has(r.id)) r.remote.dnf = true;
  }

  pickup(orb: number) {
    this.link.sendJson({ t: 'pickup', orb });
  }

  use(h: Hazard) {
    this.link.sendJson({ t: 'use', hazard: { ...h } });
  }

  hit(hazard: number, netId: number) {
    this.link.sendJson({ t: 'hit', hazard, netId });
  }

  /** One of my cars crossed the line for the last time: claim the finish with its lap times. */
  finish(r: Racer) {
    const time = r.progress.finishTime;
    if (time === null) return;
    const claim: FinishClaim = { t: 'finish', netId: r.id, laps: [...r.progress.lapTimes], time };
    this.unanswered.set(r.id, claim);
    this.link.sendJson(claim);
    this.lastClaim = this.now();
  }

  private claim() {
    for (const claim of this.unanswered.values()) this.link.sendJson(claim);
    this.lastClaim = this.now();
  }

  /** The room's results for this race came in. Returns false for a repeat (say, re-sent after a resume). */
  onResults(): boolean {
    if (this.gotResults) return false;
    this.gotResults = true;
    this.unanswered.clear();
    return true;
  }

  /** The room went back to the lobby after this race, but its results never reached us. */
  stranded(room: RoomView): boolean {
    return room.phase === 'lobby' && room.raceSeq === this.raceSeq && !this.gotResults;
  }

  /**
   * After a resume: anything sent while the socket was down never got there. Say loaded again if the start is still
   * unknown (the room ignores it outside loading), and claim again any finish the room never answered.
   */
  resumed() {
    if (this.sentLoaded && this.startAt === null) this.link.sendJson({ t: 'loaded' });
    if (this.unanswered.size) this.claim();
  }
}
