import { describe, expect, it } from 'vitest';
import { buildTrack, sampleAt } from '../src/game/track';
import type { CarState, GridEntry } from '../src/net/protocol';
import { Referee } from './referee';

// The race.test.ts track: a 100 x 60 rounded rectangle, about 370 m a lap.
const control: [number, number][] = [[0, 0], [50, 0], [70, 15], [70, 45], [50, 60], [-50, 60], [-70, 45], [-70, 15], [-50, 0]];
const track = buildTrack(control, 1);
const L = track.length;
const LAPS = 3;
// Okada top speed is 33 m/s, so no lap may be quicker than L / 52.8.
const MIN_LAP = L / (33 * 1.6);

const entry = (netId: number): GridEntry => ({ netId, slot: netId + 1, name: `P${netId}`, vehicle: 'okada', ai: false });
const grid = (n: number) => Array.from({ length: n }, (_, i) => entry(i));

/** A car on the centre line at this track distance, reporting that distance. */
function at(netId: number, distance: number, pose = distance): CarState {
  const p = sampleAt(track, pose).pos;
  return { netId, x: p.x, y: p.y, z: p.z, qx: 0, qy: 0, qz: 0, qw: 1, vx: 0, vy: 0, vz: 0, distance, laps: 0, flags: 0 };
}

/** Feeds 15 snapshots a second for a car at a steady speed from the line, between two race times. */
function drive(ref: Referee, netId: number, speed: number, from: number, to: number) {
  for (let t = from; t <= to + 1e-9; t += 1 / 15) ref.observe(at(netId, speed * t), t);
}

/** Honest lap times for a steady speed from the line. */
const lapsAt = (speed: number) => Array.from({ length: LAPS }, () => L / speed);

describe('Referee', () => {
  it('accepts a clean 3-lap finish', () => {
    const ref = new Referee(track, LAPS, grid(1));
    const time = (LAPS * L) / 25;
    expect(ref.firstFinishAt).toBeNull();
    drive(ref, 0, 25, 0, time);
    expect(ref.allDone()).toBe(false);
    expect(ref.finish(0, lapsAt(25), time)).toBe(true);
    expect(ref.firstFinishAt).toBeCloseTo(time);
    expect(ref.allDone()).toBe(true);
    // A repeat changes nothing and does not DNF the car.
    expect(ref.finish(0, lapsAt(20), time + 5)).toBe(false);
    expect(ref.results(time)).toEqual([
      { netId: 0, slot: 1, ai: false, name: 'P0', vehicle: 'okada', place: 1, time, projected: false, best: L / 25, dnf: false },
    ]);
  });

  it('rejects a lap faster than length / (topSpeed × 1.6)', () => {
    const ref = new Referee(track, LAPS, grid(1));
    const time = (LAPS * L) / 25;
    drive(ref, 0, 25, 0, time);
    const fast = MIN_LAP - 0.1;
    expect(ref.finish(0, [fast, (time - fast) / 2, (time - fast) / 2], time)).toBe(false);
    expect(ref.allDone()).toBe(true);
    expect(ref.results(time)[0]).toMatchObject({ dnf: true, time: null, projected: false });
    expect(ref.firstFinishAt).toBeNull();
  });

  it('rejects a finish when the observed distance is 30 m+ short', () => {
    const ref = new Referee(track, LAPS, grid(2));
    const time = (LAPS * L) / 25;
    drive(ref, 0, 25, 0, time - 31 / 25);
    drive(ref, 1, 25, 0, time - 25 / 25);
    expect(ref.finish(0, lapsAt(25), time)).toBe(false);
    expect(ref.finish(1, lapsAt(25), time)).toBe(true);
  });

  it('rejects lap times that do not sum to the finish time', () => {
    const ref = new Referee(track, LAPS, grid(2));
    const time = (LAPS * L) / 25;
    drive(ref, 0, 25, 0, time);
    drive(ref, 1, 25, 0, time);
    expect(ref.finish(0, lapsAt(25), time + 0.6)).toBe(false);
    expect(ref.finish(1, lapsAt(25), time + 0.4)).toBe(true);
    expect(ref.results(time).map(r => [r.netId, r.dnf])).toEqual([[1, false], [0, true]]);
  });

  it('keeps up after a 10 s snapshot gap if the jump is physically possible', () => {
    const ref = new Referee(track, LAPS, grid(2));
    const time = (LAPS * L) / 25;
    // Car 0 goes quiet for 10 s mid-race (a reconnect) and comes back 250 m on.
    drive(ref, 0, 25, 0, 20);
    drive(ref, 0, 25, 30, time);
    expect(ref.finish(0, lapsAt(25), time)).toBe(true);
    // Car 1 claims 1000 m in one second: the referee only credits what the car could have driven.
    drive(ref, 1, 25, 0, 20);
    ref.observe(at(1, LAPS * L), 21);
    expect(ref.finish(1, lapsAt(25), time)).toBe(false);
  });

  it('ignores a pose that disagrees with the reported distance', () => {
    const ref = new Referee(track, LAPS, grid(2));
    const time = (LAPS * L) / 25;
    for (const netId of [0, 1]) drive(ref, netId, 25, 0, 20);
    // Both report the finish line after a long gap, but car 1 is really 100 m back down the road.
    ref.observe(at(0, LAPS * L), time);
    ref.observe(at(1, LAPS * L, LAPS * L - 100), time);
    expect(ref.finish(0, lapsAt(25), time)).toBe(true);
    expect(ref.finish(1, lapsAt(25), time)).toBe(false);
  });

  it('orders results: finished by time, then by distance with projections, then DNF', () => {
    const ref = new Referee(track, LAPS, grid(5));
    const now = 50;
    const tA = (LAPS * L) / 24, tB = (LAPS * L) / 25;
    drive(ref, 0, 24, 0, tA);
    drive(ref, 1, 25, 0, tB);
    drive(ref, 2, 15, 0, now);
    drive(ref, 3, 18, 0, now);
    drive(ref, 4, 20, 0, now);
    expect(ref.finish(0, lapsAt(24), tA)).toBe(true);
    expect(ref.finish(1, lapsAt(25), tB)).toBe(true);
    ref.dnf(4);
    // Finished and DNF cars stay as they are.
    ref.dnf(0);
    expect(ref.allDone()).toBe(false);

    const results = ref.results(now);
    expect(results.map(r => r.netId)).toEqual([1, 0, 3, 2, 4]);
    expect(results.map(r => r.place)).toEqual([1, 2, 3, 4, 5]);
    expect(results.map(r => r.dnf)).toEqual([false, false, false, false, true]);
    expect(results.map(r => r.projected)).toEqual([false, false, true, true, false]);
    expect(results[0].time).toBeCloseTo(tB);
    expect(results[1].time).toBeCloseTo(tA);
    // A steady car's projection is its real finish time: now + remaining / average speed.
    expect(results[2].time).toBeCloseTo((LAPS * L) / 18, 0);
    expect(results[3].time).toBeCloseTo((LAPS * L) / 15, 0);
    expect(results[4].time).toBeNull();
    expect(results[0].best).toBeCloseTo(L / 25);
    expect(results[2].best).toBeNull();
  });
});
