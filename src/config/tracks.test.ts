import { describe, expect, it } from 'vitest';
import { STREET, TRACKS, eventName, trackById, trackFor, trackOrDefault } from './tracks';
import { RAISED } from '../scene/scenery';
import { makeLand, raisedMask } from '../scene/lagoon';
import { project, sampleAt } from '../game/track';
import { createProgress } from '../game/race';
import { medianMask, roadRangeMask } from '../game/outAndBack';
import { IKORODU_AXIS } from './ikoroduAxis';
import { axisPoint } from '../game/outAndBack';

describe('every track', () => {
  it('builds with a length and at least one lap', () => {
    for (const t of TRACKS) {
      expect(trackFor(t).length).toBeGreaterThan(0);
      expect(t.laps).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('event names', () => {
  it('every track has one, and no two are the same', () => {
    const names = TRACKS.map(t => eventName(t));
    for (const n of names) expect(n.trim().length).toBeGreaterThan(0);
    expect(new Set(names).size).toBe(TRACKS.length);
  });
  it('names each event after its own place', () => {
    expect(eventName(trackById('ojuelegba'))).toBe('Ojuelegba Grand Prix');
    expect(eventName(trackById('third-mainland'))).toBe('Third Mainland Bridge Grand Prix');
    expect(eventName(trackById('ikorodu'))).toBe('Ikorodu Grand Prix');
  });
  it('takes a track id too, and falls back for an unknown one', () => {
    expect(eventName('ikorodu')).toBe('Ikorodu Grand Prix');
    expect(eventName('nowhere')).toBe('Ojuelegba Grand Prix');
  });
});

describe('trackOrDefault', () => {
  it('returns ojuelegba for an unknown id and the track for a known one', () => {
    expect(trackOrDefault('nowhere').id).toBe('ojuelegba');
    expect(trackOrDefault('ikorodu').id).toBe('ikorodu');
  });
});

describe('ikorodu track', () => {
  const cfg = trackById('ikorodu');
  const tr = trackFor(cfg);

  it('is a lap of 800 to 1000 m', () => {
    expect(tr.length).toBeGreaterThan(800);
    expect(tr.length).toBeLessThan(1000);
  });

  it('has a smallest radius of at least 11.5 m (a BRT can get round both U-turns)', () => {
    const minRadius = Math.min(...tr.points.map(p => 1 / Math.max(1e-6, Math.abs(p.curvature))));
    expect(minRadius).toBeGreaterThanOrEqual(11.5);
  });

  it('puts every grid slot on its own leg', () => {
    for (let k = 0; k < 6; k++) {
      const row = Math.floor(k / 2), right = k % 2 === 1;
      const s = -8 - row * 12 - (right ? 5 : 0), lane = (right ? 1 : -1) * cfg.halfWidth * 0.42;
      const at = sampleAt(tr, s);
      const r = createProgress(tr, at.pos.x + at.right.x * lane, at.pos.z + at.right.z * lane);
      expect(Math.abs(r.distance - s)).toBeLessThan(1);
    }
  });

  it('starts on a straight, clear of the hospital-end taper', () => {
    for (let s = -40; s <= 2; s += 2) {
      expect(Math.abs(tr.points[sampleAt(tr, s).index].curvature)).toBeLessThan(1 / 60);
    }
  });

  it('keeps both legs at the same height across the median', () => {
    const mask = medianMask(tr, cfg.halfWidth, cfg.median!.width), gap = 2 * cfg.halfWidth + cfg.median!.width;
    let worst = 0, n = 0;
    tr.points.forEach((p, i) => {
      if (!mask[i]) return;
      n++;
      const q = project(tr, p.pos.x - p.right.x * gap, p.pos.z - p.right.z * gap);
      worst = Math.max(worst, Math.abs(sampleAt(tr, q.s).pos.y - p.pos.y));
    });
    expect(n).toBeGreaterThan(100);
    expect(worst).toBeLessThan(0.1);
  });

  it('has a concrete barrier on the last 117 m (the dual carriageway) and painted kerb elsewhere', () => {
    const b = cfg.median!.barrier!, L = IKORODU_AXIS.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - IKORODU_AXIS[i - 1][0], p[1] - IKORODU_AXIS[i - 1][1]) : 0), 0);
    expect(b[1]).toBeCloseTo(L, 1);
    expect(b[1] - b[0]).toBeGreaterThan(100);
    expect(b[1] - b[0]).toBeLessThan(130);
    const mask = roadRangeMask(tr, cfg.axis!, b, 2 * cfg.halfWidth + cfg.median!.width), med = medianMask(tr, cfg.halfWidth, cfg.median!.width);
    const both = mask.filter((m, i) => m && med[i]).length;
    expect(both).toBeGreaterThan(50);
    expect(both).toBeLessThan(med.filter(Boolean).length / 2);
  });

  it('has a roundabout island that fits inside the U-turn, statue and all', () => {
    const isl = cfg.islands![0], c = axisPoint(cfg.axis!, isl.road);
    expect(isl.statue).toBe(true);
    const nearest = Math.min(...tr.points.map(p => Math.hypot(p.pos.x - c.x, p.pos.z - c.z)));
    // The road's inner edge is its centre line minus the half width.
    expect(isl.radius + cfg.halfWidth).toBeLessThanOrEqual(nearest + 0.01);
    expect(isl.radius).toBeGreaterThan(5);
  });

  it('flags the constructed hospital U-turn as invented geometry', () => {
    expect(cfg.invented).toHaveLength(1);
    const [a, b] = cfg.invented![0].road;
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThan(a);
    expect(cfg.invented![0].why).toMatch(/hospital/);
  });

  it('keeps every zone inside the axis and covers both streets for most of the road', () => {
    const L = IKORODU_AXIS.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - IKORODU_AXIS[i - 1][0], p[1] - IKORODU_AXIS[i - 1][1]) : 0), 0);
    for (const street of ['north', 'south'] as const) {
      const zs = cfg.zones.filter((z): z is Extract<typeof z, { road: [number, number] }> => 'road' in z && z.street === street);
      let covered = 0;
      for (const z of zs) {
        expect(z.road[0]).toBeGreaterThanOrEqual(0);
        expect(z.road[1]).toBeLessThanOrEqual(L + 0.01);
        expect(z.road[1]).toBeGreaterThan(z.road[0]);
        covered += z.road[1] - z.road[0];
      }
      expect(covered / L).toBeGreaterThan(0.7);
    }
  });

  it('puts each real sign on a zone of its own kind', () => {
    const kinds = new Set(cfg.zones.map(z => z.kind));
    for (const k of ['mosque', 'petrol', 'hoarding', 'kfc', 'tailoring', 'hospital'] as const) expect(kinds.has(k)).toBe(true);
  });
});

describe('every track, in detail', () => {
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
