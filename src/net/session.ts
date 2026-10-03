// One room race as seen from this phone: the shared clock, the start time and what we tell the room.
import type { Hazard, NetHooks, RaceRuntime, Racer } from '../game/runtime';
import type { OnlineSetup } from '../game/setup';
import type { ClockSync } from './clock';
import type { NetLink } from './connection';
import { FLAG, START_LEAD_MS, TICK_HZ, decodeSnapshot, encodeSnapshot, type CarState, type ServerMessage } from './protocol';

export class NetSession implements NetHooks {
  readonly raceSeq: number;
  private startAt: number | null = null;
  private sentLoaded = false;
  private race: RaceRuntime | null = null;
  private lastSend = -Infinity;
  /** Cars that sounded their horn since the last send: an AI toots for one frame, which a 15 Hz send would miss. */
  private hornSince = new Set<number>();

  constructor(private readonly link: NetLink, private readonly clock: ClockSync, readonly setup: OnlineSetup & { raceSeq: number }) {
    this.raceSeq = setup.raceSeq;
  }

  attach(race: RaceRuntime) {
    race.net = this;
    this.race = race;
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
          | (r.wobble > 0 ? FLAG.wobble : 0) | (this.hornSince.has(r.id) ? FLAG.horn : 0) | (r.progress.finishTime !== null ? FLAG.finished : 0),
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
      r.controls.horn = (car.flags & FLAG.horn) !== 0;
    }
  }

  /**
   * Another phone's pickup, throw or hit. The victim's phone decides hits, so a hit here only
   * tidies up the hazard; the victim's slowdown or slide arrives in its snapshots.
   */
  onEvent(m: ServerMessage) {
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
        race.puffs.push({ x: h.x, y: h.ground, z: h.z, age: 0, color: 'juju' });
        h.life = 0;
      } else h.life = Math.min(h.life, 8);
    }
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

  // The finish goes over the wire with the referee.
  finish(_r: Racer) {}
}
