import { describe, expect, it } from 'vitest';
import { STREET, TRACKS, trackFor } from './tracks';
import { RAISED } from '../scene/scenery';
import { makeLand, raisedMask } from '../scene/lagoon';
import { sampleAt } from '../game/track';

describe('every track', () => {
  for (const cfg of TRACKS) {
    describe(cfg.id, () => {
      const track = trackFor(cfg);
      it('has a lap, pickups and critters that all lie within it', () => {
        expect(cfg.laps).toBeGreaterThanOrEqual(1);
        for (const s of cfg.items) { expect(s).toBeGreaterThan(0); expect(s).toBeLessThan(track.length); }
        for (const c of cfg.critters ?? []) { expect(c.s).toBeGreaterThan(0); expect(c.s).toBeLessThan(track.length); }
      });
      it('has no bend a BRT cannot take (12 m radius)', () => {
        const tightest = Math.min(...track.points.map(p => 1 / Math.max(1e-6, Math.abs(p.curvature))));
        expect(tightest).toBeGreaterThanOrEqual(12);
      });
      it('starts and ends the lap at the same height', () => {
        expect(track.points[0].pos.y).toBeCloseTo(0, 5);
      });
    });
  }
});

describe('Third Mainland Bridge', () => {
  const cfg = TRACKS.find(t => t.id === 'third-mainland')!;
  const track = trackFor(cfg);

  it('is a long lap of two laps, at least twice an Ojuelegba lap', () => {
    const oj = trackFor(TRACKS.find(t => t.id === 'ojuelegba')!);
    expect(cfg.laps).toBe(2);
    expect(track.length).toBeGreaterThan(2300);
    expect(track.length).toBeLessThan(3000);
    expect(track.length).toBeGreaterThan(oj.length * 1.8);
  });

  it('is a winding road, not an oval: the heading turns right and left, in bends of different sizes', () => {
    const turns = track.points.map(p => p.curvature);
    const left = turns.filter(k => k > 1 / 400).length, right = turns.filter(k => k < -1 / 400).length;
    expect(left).toBeGreaterThan(track.points.length * 0.1);
    expect(right).toBeGreaterThan(track.points.length * 0.1);
    const radii = [30, 60, 120].map(r => turns.some(k => Math.abs(k) > 1 / (r * 1.3) && Math.abs(k) < 1 / (r * 0.7)));
    expect(radii.filter(Boolean).length).toBeGreaterThanOrEqual(2);
  });

  it('has a straight, level start with room for the grid', () => {
    const near = track.points.filter(p => p.s < 60 || p.s > track.length - 45);
    for (const p of near) { expect(1 / Math.max(1e-6, Math.abs(p.curvature))).toBeGreaterThan(150); expect(p.pos.y).toBeLessThan(0.1); }
  });

  it('climbs onto the deck and comes down again, on grades a kart can drive', () => {
    const ys = track.points.map(p => p.pos.y);
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(12);
    const grade = Math.max(...track.points.map((p, i) => Math.abs(track.points[(i + 1) % track.points.length].pos.y - p.pos.y) / track.spacing));
    expect(grade).toBeLessThan(0.08);
    // The causeway home and the start are at ground level.
    expect(sampleAt(track, 2000).pos.y).toBeCloseTo(0, 1);
    expect(sampleAt(track, 40).pos.y).toBeCloseTo(0, 1);
  });

  it('keeps every part of the road well clear of every other part', () => {
    const pts = track.points;
    let closest = Infinity;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const d = Math.abs(pts[i].s - pts[j].s);
      if (Math.min(d, track.length - d) < 90) continue;
      closest = Math.min(closest, pts[i].pos.distanceTo(pts[j].pos));
    }
    expect(closest).toBeGreaterThan(4 * cfg.halfWidth);
  });

  it('puts shop fronts only where the road is on the ground, never on a ramp or the deck', () => {
    for (const z of cfg.zones) {
      if (!('from' in z)) continue;
      for (let s = z.from * track.length; s < z.to * track.length; s += 4) expect(sampleAt(track, s).pos.y).toBeLessThan(RAISED);
    }
  });

  it('has a lagoon: land at the start, the island and the home street, water under the span and the causeway', () => {
    const water = cfg.setting!.water!, land = makeLand(track, water);
    const at = (s: number) => sampleAt(track, s).pos;
    for (const s of [0, 150, 1750, 2500]) expect(land.isLand(at(s).x, at(s).z), `land at ${s}`).toBe(true);
    for (const s of [900, 1100, 1300, 2050, 2150]) expect(land.isLand(at(s).x, at(s).z), `water at ${s}`).toBe(false);
    // The span stands well above the water; the causeway only just.
    expect(sampleAt(track, 1100).pos.y - water.level).toBeGreaterThan(10);
    expect(sampleAt(track, 2100).pos.y - water.level).toBeLessThan(4);
  });

  it('marks the ramps and the deck as raised, and nothing else', () => {
    const raised = raisedMask(track);
    expect(raised[Math.round(1000 / track.spacing)]).toBe(true);
    expect(raised[Math.round(2100 / track.spacing)]).toBe(false);
    expect(raised[Math.round(100 / track.spacing)]).toBe(false);
  });

  it('has no shortcuts yet, and gains branches when it is given some', () => {
    expect(cfg.shortcuts ?? []).toEqual([]);
    expect(track.branches).toBeUndefined();
    const withCut = trackFor({ ...cfg, shortcuts: [{ id: 'across-the-bay', from: 700, to: 1200, path: [[380, 520]] }] });
    expect(withCut.branches).toHaveLength(1);
    expect(withCut.branches![0].from).toBe(700);
  });
});

describe('settings', () => {
  it('the street tracks keep the dusty default look, with no water', () => {
    const oj = TRACKS.find(t => t.id === 'ojuelegba')!;
    expect(oj.setting ?? STREET).toBe(STREET);
    expect(STREET.water).toBeUndefined();
    expect(STREET.backdrop).toBe('city');
  });
  it('the bridge has its own sky, fog and shore, different from the streets', () => {
    const s = TRACKS.find(t => t.id === 'third-mainland')!.setting!;
    expect(s.backdrop).toBe('shore');
    expect(s.sky).not.toEqual(STREET.sky);
    expect(s.fog).not.toBe(STREET.fog);
    expect(s.water).toBeDefined();
  });
});
