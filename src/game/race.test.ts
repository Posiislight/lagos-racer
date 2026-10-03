import { describe, expect, it } from 'vitest';
import { buildTrack, project, sampleAt } from './track';
import { createProgress, updateProgress, trackRemote, standings, currentLap, formatTime, coinsForPlace } from './race';

// A 100 x 60 rounded rectangle, driven anticlockwise from (0, 0) heading +x.
const control: [number, number][] = [[0, 0], [50, 0], [70, 15], [70, 45], [50, 60], [-50, 60], [-70, 45], [-70, 15], [-50, 0]];
const track = buildTrack(control, 1);

/** Drive a racer along the centre line from distance a to b in small steps. */
function drive(r: ReturnType<typeof createProgress>, from: number, to: number, laps = 3, clock = { t: 0 }) {
  const events = [];
  const step = Math.sign(to - from) * 2;
  for (let s = from; step > 0 ? s <= to : s >= to; s += step) {
    clock.t += 0.1;
    const p = sampleAt(track, s).pos;
    const e = updateProgress(track, r, p.x, p.z, clock.t, laps);
    if (e) events.push(e);
  }
  return events;
}

describe('track', () => {
  it('starts at the first control point and measures a sensible length', () => {
    expect(track.points[0].pos.x).toBeCloseTo(0, 1);
    expect(track.points[0].pos.z).toBeCloseTo(0, 1);
    expect(track.length).toBeGreaterThan(340);
    expect(track.length).toBeLessThan(400);
  });

  it('projects points onto the centre line with the right side positive', () => {
    const at = sampleAt(track, 20);
    const p = project(track, at.pos.x + at.right.x * 3, at.pos.z + at.right.z * 3);
    expect(p.s).toBeCloseTo(20, 0);
    expect(p.lateral).toBeCloseTo(3, 1);
  });

  it('marks bends with curvature and straights with almost none', () => {
    const straight = track.points[Math.round(20 / track.spacing)];
    expect(Math.abs(straight.curvature)).toBeLessThan(0.002);
    expect(Math.max(...track.points.map(p => Math.abs(p.curvature)))).toBeGreaterThan(0.02);
  });
});

describe('lap counting', () => {
  it('counts a lap only after a full loop from the grid', () => {
    const grid = sampleAt(track, -10).pos;
    const r = createProgress(track, grid.x, grid.z);
    expect(r.distance).toBeCloseTo(-10, 0);
    expect(drive(r, -10, 5)).toEqual([]);
    expect(currentLap(r, 3)).toBe(1);
    const events = drive(r, 5, track.length + 5);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ lap: 1, finished: false });
    expect(currentLap(r, 3)).toBe(2);
  });

  it("doesn't count laps for rocking back and forth over the line", () => {
    const grid = sampleAt(track, -10).pos;
    const r = createProgress(track, grid.x, grid.z);
    for (let i = 0; i < 5; i++) { drive(r, -10, 10); drive(r, 10, -10); }
    expect(r.lapsDone).toBe(0);
  });

  it("doesn't count a lap driven backwards", () => {
    const r = createProgress(track, 0.5, 0);
    const events = drive(r, 0, -track.length - 20);
    expect(events).toEqual([]);
    expect(r.distance).toBeLessThan(-track.length);
  });

  it('ignores teleports instead of counting them as progress', () => {
    const r = createProgress(track, 0.5, 0);
    const far = sampleAt(track, track.length / 2 - 5).pos;
    updateProgress(track, r, far.x, far.z, 1, 3);
    expect(r.distance).toBeLessThan(5);
  });

  it('finishes after the last lap and records lap times', () => {
    const grid = sampleAt(track, -4).pos;
    const r = createProgress(track, grid.x, grid.z);
    const events = drive(r, -4, track.length * 3 + 2, 3);
    expect(events.map(e => e.lap)).toEqual([1, 2, 3]);
    expect(events[2].finished).toBe(true);
    expect(r.finishTime).not.toBeNull();
    expect(r.lapTimes).toHaveLength(3);
  });
});

describe('standings', () => {
  it('ranks finishers by time, then the rest by distance', () => {
    const mk = (name: string, distance: number, finishTime: number | null) =>
      ({ name, progress: { ...createProgress(track, 0, 0), distance, finishTime } });
    const order = standings([mk('a', 100, null), mk('b', 900, 80), mk('c', 300, null), mk('d', 900, 75)]).map(r => r.name);
    expect(order).toEqual(['d', 'b', 'c', 'a']);
  });

  it('formats times as m:ss.cc', () => {
    expect(formatTime(65.432)).toBe('1:05.43');
    expect(formatTime(null)).toBe('--:--.--');
  });
});

describe('trackRemote', () => {
  it('updates index, s and lateral but never distance or laps', () => {
    const grid = sampleAt(track, 40).pos;
    const r = createProgress(track, grid.x, grid.z);
    r.distance = 123;
    r.lapsDone = 1;
    const at = sampleAt(track, 60);
    trackRemote(track, r, at.pos.x + at.right.x * 2, at.pos.z + at.right.z * 2);
    expect(r.s).toBeCloseTo(60, 0);
    expect(r.lateral).toBeCloseTo(2, 1);
    expect(Math.abs(r.index * track.spacing - 60)).toBeLessThanOrEqual(track.spacing);
    expect(r.distance).toBe(123);
    expect(r.lapsDone).toBe(1);
    expect(r.lapTimes).toEqual([]);
    expect(r.finishTime).toBeNull();
  });
});

describe('coinsForPlace', () => {
  it('pays 150, 100, 60, 30 for the first four places, then 20', () => {
    expect([1, 2, 3, 4, 5, 6].map(p => coinsForPlace(p))).toEqual([150, 100, 60, 30, 20, 20]);
  });
});
