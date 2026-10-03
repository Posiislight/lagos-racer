import { describe, expect, it } from 'vitest';
import { buildTrack, project, sampleAt, type Track } from './track';
import { medianMask, outAndBack, roadToS } from './outAndBack';

// A straight road heading west (-x). The right of travel is north (-z), so the westbound leg is at z < 0.
const axis: [number, number][] = [[0, 0], [-50, 0], [-100, 0], [-150, 0], [-200, 0]];
const opts = { gap: 14.6, turnRadius: 12, startAt: 40 };
const control = outAndBack(axis, opts);
const track = buildTrack(control, 2);

/** The sample nearest (x, z). */
const nearest = (t: Track, x: number, z: number) => {
  let best = 0, bd = Infinity;
  t.points.forEach((p, i) => { const d = (p.pos.x - x) ** 2 + (p.pos.z - z) ** 2; if (d < bd) { bd = d; best = i; } });
  return best;
};

describe('out and back', () => {
  it('starts on the north leg at startAt', () => {
    expect(control[0][0]).toBeCloseTo(-40, 1);
    expect(control[0][1]).toBeCloseTo(-7.3, 1);
  });

  it('builds a closed loop of the right length', () => {
    expect(track.length).toBeGreaterThan(460);
    expect(track.length).toBeLessThan(500);
    const minRadius = Math.min(...track.points.map(p => 1 / Math.max(1e-6, Math.abs(p.curvature))));
    expect(minRadius).toBeGreaterThanOrEqual(11);
  });

  it('keeps the legs a median apart', () => {
    const n = track.points[nearest(track, -100, -7.3)].pos, s = track.points[nearest(track, -100, 7.3)].pos;
    expect(Math.abs(s.z - n.z)).toBeGreaterThan(14.3);
    expect(Math.abs(s.z - n.z)).toBeLessThan(14.9);
  });

  it('project stays on its own leg', () => {
    const p0 = track.points[nearest(track, -100, -7.3)];
    const x = p0.pos.x + p0.right.x * 2, z = p0.pos.z + p0.right.z * 2;
    const p = project(track, x, z);
    expect(p.lateral).toBeCloseTo(2, 1);
    expect(sampleAt(track, p.s).pos.z).toBeLessThan(0);
  });

  it('marks the median, not the U-turns', () => {
    const mask = medianMask(track, 6.5, 1.6);
    expect(mask).toHaveLength(track.points.length);
    expect(mask[nearest(track, -100, -7.3)]).toBe(true);
    expect(mask[nearest(track, -100, 7.3)]).toBe(true);
    const apex = track.points.reduce((b, p, i) => (p.pos.x < track.points[b].pos.x ? i : b), 0);
    expect(mask[apex]).toBe(false);
  });

  it('maps road distance to each leg', () => {
    const n = sampleAt(track, roadToS(track, axis, 100, 'north', 14.6)).pos;
    expect(Math.hypot(n.x + 100, n.z + 7.3)).toBeLessThan(0.5);
    const s = sampleAt(track, roadToS(track, axis, 100, 'south', 14.6)).pos;
    expect(Math.hypot(s.x + 100, s.z - 7.3)).toBeLessThan(0.5);
  });

  it('matches heights across the median', () => {
    const hilly = buildTrack(control, 2, [[0.5, 2, 0.4], [0.1, 9, 1]], 'x');
    const a = hilly.points[nearest(hilly, -100, -7.3)].pos.y, b = hilly.points[nearest(hilly, -100, 7.3)].pos.y;
    expect(Math.abs(a - b)).toBeLessThan(0.05);
    expect(hilly.points[0].pos.y).toBeCloseTo(0, 6);
    expect(Math.max(...hilly.points.map(p => Math.abs(p.pos.y)))).toBeGreaterThan(0.2);
  });
});
