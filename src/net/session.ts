// One room race as seen from this phone: the shared clock, the start time and what we tell the room.
import type { Hazard, NetHooks, RaceRuntime, Racer } from '../game/runtime';
import type { OnlineSetup } from '../game/setup';
import type { ClockSync } from './clock';
import type { NetLink } from './connection';
import { START_LEAD_MS } from './protocol';

export class NetSession implements NetHooks {
  readonly raceSeq: number;
  private startAt: number | null = null;
  private sentLoaded = false;

  constructor(private readonly link: NetLink, private readonly clock: ClockSync, readonly setup: OnlineSetup & { raceSeq: number }) {
    this.raceSeq = setup.raceSeq;
  }

  attach(race: RaceRuntime) {
    race.net = this;
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

  // Items and the finish go over the wire from Task 10 on.
  pickup(_orb: number) {}
  use(_h: Hazard) {}
  hit(_hazardId: number, _victim: number) {}
  finish(_r: Racer) {}
}
