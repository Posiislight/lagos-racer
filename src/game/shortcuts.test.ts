import { describe, expect, it } from 'vitest';
import { applyProfile, buildTrack, profileHeight, project, sampleAt } from './track';
import { buildBranch, checkShortcut, mainDistance, projectBranch, projectRoad, type Shortcut } from './shortcuts';
import { createProgress, updateProgress } from './race';

// A loop with a bulge out along the top (z = -70): the road there is 260 m, and a straight cut across its base is about 200 m.
const loop: [number, number][] = [[0, 0], [100, 0], [160, -70], [240, -70], [300, 0], [400, 0], [460, 40], [400, 90], [300, 90], [100, 90], [0, 90], [-60, 45]];
const HW = 6.5;
const mainTrack = buildTrack(loop, 2);
const FROM = project(mainTrack, 100, 0).s, TO = project(mainTrack, 300, 0).s;

/** A road straight across the base of the bulge. */
const cut: Shortcut = { id: 'cut', from: FROM, to: TO, path: [[200, 0]] };

describe('height profile', () => {
  const profile: [number, number][] = [[0, 0], [100, 0], [300, 12], [500, 12]];
  it('is level before the first knot and after the last, and hits each knot', () => {
    expect(profileHeight(profile, -5)).toBe(0);
    expect(profileHeight(profile, 100)).toBe(0);
    expect(profileHeight(profile, 300)).toBeCloseTo(12);
    expect(profileHeight(profile, 900)).toBe(12);
  });
  it('eases smoothly between knots, with no step', () => {
    expect(profileHeight(profile, 200)).toBeCloseTo(6);
    let prev = profileHeight(profile, 100);
    for (let s = 101; s <= 300; s++) { const y = profileHeight(profile, s); expect(Math.abs(y - prev)).toBeLessThan(0.1); prev = y; }
  });
  it('sets every sample on a track', () => {
    const t = buildTrack(loop, 2);
    applyProfile(t, [[0, 0], [100, 0], [200, 8]]);
    expect(t.points[0].pos.y).toBe(0);
    expect(t.points.find(p => p.s > 150)!.pos.y).toBeGreaterThan(1);
  });
});

describe('shortcuts', () => {
  const main = mainTrack;
  const branch = buildBranch(main, cut, HW);

  it('starts and ends on the main road, pointing the same way', () => {
    const a = sampleAt(main, FROM), b = sampleAt(main, TO), first = branch.points[0], last = branch.points[branch.points.length - 1];
    expect(first.pos.distanceTo(a.pos)).toBeLessThan(0.5);
    expect(last.pos.distanceTo(b.pos)).toBeLessThan(0.5);
    expect(first.tangent.dot(a.tangent)).toBeGreaterThan(0.95);
    expect(last.tangent.dot(b.tangent)).toBeGreaterThan(0.95);
  });

  it('is shorter than the road it replaces, by the amount it says', () => {
    expect(branch.saves).toBeGreaterThan(50);
    expect(branch.saves).toBeCloseTo(TO - FROM - branch.length, 5);
  });

  it('eases between the heights of its two ends', () => {
    const ramp = buildTrack(loop, 2);
    applyProfile(ramp, [[0, 0], [FROM, 0], [TO, 10], [900, 10]]);
    const b = buildBranch(ramp, cut, HW);
    expect(b.points[0].pos.y).toBeCloseTo(0, 1);
    expect(b.points[b.points.length - 1].pos.y).toBeCloseTo(10, 1);
    const mid = b.points[Math.floor(b.points.length / 2)].pos.y;
    expect(mid).toBeGreaterThan(3); expect(mid).toBeLessThan(7);
  });

  it('passes the checks when it is a real shortcut', () => {
    expect(checkShortcut(main, branch, HW)).toEqual([]);
  });

  it('is rejected when it is not shorter, runs into the road, or bends too tightly', () => {
    const far = buildBranch(main, { id: 'far', from: FROM, to: TO, path: [[200, -150]] }, HW);
    expect(checkShortcut(main, far, HW).join(' ')).toMatch(/not shorter/);
    const through = buildBranch(main, { id: 'through', from: FROM, to: TO, path: [[200, -66]] }, HW);
    expect(checkShortcut(main, through, HW).join(' ')).toMatch(/runs into the main road/);
    const sharp = buildBranch(main, { id: 'sharp', from: FROM, to: TO, path: [[150, -5], [154, 5], [158, -5], [162, 5], [200, 0]] }, HW);
    expect(checkShortcut(main, sharp, HW).join(' ')).toMatch(/tighter/);
  });

  it('maps a position on the branch to the main-road distance it replaces, end to end', () => {
    expect(mainDistance(branch, 0)).toBe(FROM);
    expect(mainDistance(branch, branch.length)).toBe(TO);
    expect(mainDistance(branch, branch.length / 2)).toBeCloseTo((FROM + TO) / 2);
  });

  it('projectBranch reports distance along and across the branch', () => {
    const mid = branch.points[Math.floor(branch.points.length / 2)];
    const p = projectBranch(branch, mid.pos.x + mid.right.x * 2, mid.pos.z + mid.right.z * 2);
    expect(p.lateral).toBeCloseTo(2, 1);
    expect(p.s).toBeCloseTo(mid.s, 0);
  });

  describe('projectRoad', () => {
    const track = { ...main, branches: [branch] };
    it('is plain project() on the main road, whatever shortcuts there are', () => {
      for (const s of [10, 60, 250, 500, 700]) {
        const at = sampleAt(track, s), a = projectRoad(track, at.pos.x, at.pos.z), b = project(track, at.pos.x, at.pos.z);
        expect(a.s).toBeCloseTo(b.s, 3);
      }
    });
    it('puts a car on the branch at the matching main-road distance', () => {
      const mid = branch.points[Math.floor(branch.points.length / 2)], p = projectRoad(track, mid.pos.x, mid.pos.z);
      expect(p.s).toBeCloseTo(mainDistance(branch, mid.s), 0);
      expect(p.s).toBeGreaterThan(FROM);
      expect(p.s).toBeLessThan(TO);
    });
    it('without branches it is exactly project()', () => {
      const at = sampleAt(main, 80);
      expect(projectRoad(main, at.pos.x, at.pos.z)).toEqual(project(main, at.pos.x, at.pos.z));
    });
  });

  describe('lap counting', () => {
    const track = { ...main, branches: [branch] };
    /** Drive a path of world positions and return the progress at the end. */
    const drive = (path: { x: number; z: number }[], laps = 1) => {
      const r = createProgress(track, path[0].x, path[0].z);
      let lapEvents = 0;
      for (const p of path) if (updateProgress(track, r, p.x, p.z, 0, laps)) lapEvents++;
      return { r, lapEvents };
    };
    const along = (pts: { pos: { x: number; z: number } }[], from = 0, to = pts.length) => pts.slice(from, to).map(p => ({ x: p.pos.x, z: p.pos.z }));
    const lapStart = main.points.findIndex(p => p.s >= main.length - 6);

    it('counts a lap driven on the main road only', () => {
      const path = [...along(main.points.slice(lapStart)), ...along(main.points), ...along(main.points.slice(0, 5))];
      const { lapEvents } = drive(path.slice(3));
      expect(lapEvents).toBe(1);
    });

    it('counts a lap driven through the shortcut, with no jump at the fork or the rejoin', () => {
      const i0 = main.points.findIndex(p => p.s >= FROM), i1 = main.points.findIndex(p => p.s >= TO);
      const path = [
        ...along(main.points.slice(lapStart)), ...along(main.points, 0, i0),
        ...along(branch.points),
        ...along(main.points, i1), ...along(main.points.slice(0, 6)),
      ];
      const { r, lapEvents } = drive(path.slice(3));
      expect(lapEvents).toBe(1);
      expect(r.lapsDone).toBe(1);
    });

    it('a car on the branch moves forward through the stretch it replaces, never backwards or in leaps', () => {
      const i0 = main.points.findIndex(p => p.s >= FROM - 20);
      const path = [...along(main.points, i0, i0 + 10), ...along(branch.points)];
      const r = createProgress(track, path[0].x, path[0].z);
      let last = r.distance, biggest = 0;
      for (const p of path) { updateProgress(track, r, p.x, p.z, 0, 3); biggest = Math.max(biggest, Math.abs(r.distance - last)); last = r.distance; }
      expect(biggest).toBeLessThan(4);
      expect(r.distance).toBeGreaterThan(TO - 30);
    });
  });
});
