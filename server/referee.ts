import { project, wrapDelta, type Track } from '../src/game/track';
import { vehicleById } from '../src/config/vehicles';
import type { CarState, GridEntry, NetResult } from '../src/net/protocol';

// Fastest a car can really go: its top speed with a fuel boost and a downhill.
const SPEED_MARGIN = 1.6;
// A reported distance this far from where the car actually sits on the lap is a lie (or garbage).
const POSE_TOLERANCE = 30;
// Room for a respawn to put a car back down the road, and for one snapshot of slack going forward.
const MAX_BACK = 50;
const JUMP_SLACK = 10;
// How far short of the line a finish may be claimed: the last snapshot can trail the finish message.
const FINISH_SLACK = 30;
const SUM_SLACK = 0.5;
// However many snapshots arrive, nobody is further on than full speed from the back of the grid allows.
const GRID_DEPTH = 50;
const DISTANCE_SLACK = 30;
// A finish claim may come late (a phone that dropped re-sends it on resume) but never from the future, and never
// from well before the car's last snapshot that had it still short of the line.
const FUTURE_SLACK = 1;
const CLOCK_SLACK = 2;

type Car = {
  entry: GridEntry;
  topSpeed: number;
  /** The referee's own idea of the distance driven, only ever moved as far as the car could have gone. */
  distance: number;
  lastTime: number;
  /** Race time (s) stamped on the last snapshot that had the car short of the line. */
  lastShortAt: number;
  finishTime: number | null;
  laps: number[];
  dnf: boolean;
};

/**
 * Lap and finish validation for one room race, from the snapshots the server relays. It does not use
 * updateProgress: its 25 m step limit would throw away a car's real distance after a reconnect gap.
 */
export class Referee {
  private cars = new Map<number, Car>();
  private first: number | null = null;

  constructor(private readonly track: Track, private readonly laps: number, grid: GridEntry[]) {
    for (const entry of grid) {
      const topSpeed = vehicleById(entry.vehicle).tuning.topSpeed;
      this.cars.set(entry.netId, { entry, topSpeed, distance: 0, lastTime: 0, lastShortAt: 0, finishTime: null, laps: [], dnf: false });
    }
  }

  /**
   * A car's pose from a snapshot at race time `time` (s), which the room keeps from running ahead of its own clock.
   * Its own stamp, not when it arrived: a stalled socket delivers the last few seconds in one late burst.
   */
  observe(state: CarState, time: number) {
    const car = this.cars.get(state.netId);
    if (!car || car.finishTime !== null || car.dnf) return;
    const L = this.track.length;
    const s = project(this.track, state.x, state.z).s;
    if (Math.abs(wrapDelta(this.track, ((state.distance % L) + L) % L, s)) > POSE_TOLERANCE) return;
    const reach = car.topSpeed * SPEED_MARGIN * Math.max(0, time - car.lastTime) + JUMP_SLACK;
    // The step slack alone would add up over a burst of same-time snapshots.
    const cap = car.topSpeed * SPEED_MARGIN * Math.max(0, time) + GRID_DEPTH + DISTANCE_SLACK;
    car.distance = Math.min(car.distance + reach, cap, Math.max(car.distance - MAX_BACK, state.distance));
    car.lastTime = Math.max(car.lastTime, time);
    if (state.distance < this.laps * L) car.lastShortAt = Math.max(car.lastShortAt, time);
  }

  /**
   * A finish claim, received at server race time `now` (s). A refused claim makes the car DNF; a repeat, or a
   * claim for a DNF car, changes nothing.
   */
  finish(netId: number, laps: number[], time: number, now: number): boolean {
    const car = this.cars.get(netId);
    if (!car || car.finishTime !== null || car.dnf) return false;
    const L = this.track.length;
    const minLap = L / (car.topSpeed * SPEED_MARGIN);
    const ok = laps.length === this.laps
      && car.distance >= this.laps * L - FINISH_SLACK
      && laps.every(t => Number.isFinite(t) && t >= minLap)
      && Number.isFinite(time)
      && time <= now + FUTURE_SLACK
      && time >= car.lastShortAt - CLOCK_SLACK
      && Math.abs(laps.reduce((a, b) => a + b, 0) - time) <= SUM_SLACK;
    if (!ok) {
      car.dnf = true;
      return false;
    }
    car.finishTime = time;
    car.laps = [...laps];
    this.first ??= time;
    return true;
  }

  /** The distance the referee credits this car with, or null for a car not on the grid. */
  distanceOf(netId: number): number | null {
    return this.cars.get(netId)?.distance ?? null;
  }

  dnf(netId: number) {
    const car = this.cars.get(netId);
    if (car && car.finishTime === null) car.dnf = true;
  }

  /** Race time of the first accepted finish. */
  get firstFinishAt(): number | null {
    return this.first;
  }

  allDone(): boolean {
    return [...this.cars.values()].every(c => c.finishTime !== null || c.dnf);
  }

  /** Final standings at race time `now`: finished by time, then the rest by distance with projected times, DNF last. */
  results(now: number): NetResult[] {
    const cars = [...this.cars.values()];
    const finished = cars.filter(c => c.finishTime !== null).sort((a, b) => a.finishTime! - b.finishTime!);
    const byDistance = (a: Car, b: Car) => b.distance - a.distance;
    const running = cars.filter(c => c.finishTime === null && !c.dnf).sort(byDistance);
    const dnf = cars.filter(c => c.dnf).sort(byDistance);
    const total = this.laps * this.track.length;
    return [...finished, ...running, ...dnf].map((c, i) => {
      let time = c.finishTime;
      if (time === null && !c.dnf) {
        const avg = c.distance > 0 && now > 0 ? c.distance / now : 0;
        time = avg > 1 ? now + (total - c.distance) / avg : null;
      }
      const { netId, slot, ai, name, vehicle } = c.entry;
      return {
        netId, slot, ai, name, vehicle, place: i + 1, time, projected: c.finishTime === null && !c.dnf,
        best: c.laps.length ? Math.min(...c.laps) : null, dnf: c.dnf,
      };
    });
  }
}
