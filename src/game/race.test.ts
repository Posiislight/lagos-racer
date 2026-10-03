import { describe, expect, it } from 'vitest';
import { buildTrack, project, sampleAt } from './track';
import { createProgress, updateProgress, standings, currentLap, formatTime } from './race';
import { TRACKS } from '../config/tracks';

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

describe('ojuelegba track', () => {
  const cfg = TRACKS.find(t => t.id === 'ojuelegba')!;
  const oj = buildTrack(cfg.control, 2, cfg.hills, cfg.hillsAxis);

  it('is a lap of about 750 m with no bend tighter than the U-turns', () => {
    expect(oj.length).toBeGreaterThan(700);
    expect(oj.length).toBeLessThan(850);
    const minRadius = Math.min(...oj.points.map(p => 1 / Math.max(1e-6, Math.abs(p.curvature))));
    expect(minRadius).toBeGreaterThanOrEqual(11);
  });

  it('starts on the north leg heading west', () => {
    expect(oj.points[0].tangent.x).toBeLessThan(-0.5);
  });

  it('puts every grid slot on its own leg (createProgress on the grid)', () => {
    for (let k = 0; k < 6; k++) {
      const row = Math.floor(k / 2), right = k % 2 === 1;
      const s = -8 - row * 12 - (right ? 5 : 0), lane = (right ? 1 : -1) * cfg.halfWidth * 0.42;
      const at = sampleAt(oj, s);
      const r = createProgress(oj, at.pos.x + at.right.x * lane, at.pos.z + at.right.z * lane);
      expect(Math.abs(r.distance - s)).toBeLessThan(1);
    }
  });

  it('has gentle hills', () => {
    const ys = oj.points.map(p => p.pos.y), range = Math.max(...ys) - Math.min(...ys);
    expect(range).toBeGreaterThan(0.8);
    expect(range).toBeLessThan(2);
  });
});
