import { describe, expect, it } from 'vitest';
import { TRACKS, trackById, trackFor } from './tracks';
import { project, sampleAt } from '../game/track';
import { createProgress } from '../game/race';
import { medianMask } from '../game/outAndBack';

describe('every track', () => {
  it('builds with a length and at least one lap', () => {
    for (const t of TRACKS) {
      expect(trackFor(t).length).toBeGreaterThan(0);
      expect(t.laps).toBeGreaterThanOrEqual(1);
    }
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
});
