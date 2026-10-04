import { describe, expect, it } from 'vitest';
import { buildResults } from './results';
import { racerAt } from './testkit';

describe('buildResults', () => {
  it('reports a finished racer at its finish time', () => {
    const r = racerAt(1, 10, true);
    r.progress.finishTime = 95.5;
    r.progress.lapTimes = [32, 31.2, 32.3];
    const [res] = buildResults([r], 100, 3, 600);
    expect(res).toMatchObject({ time: 95.5, projected: false, best: 31.2, isPlayer: true, name: 'R1', vehicle: r.vehicle.id, color: r.paint.color, out: null });
  });

  it('projects a finish time for a racer still on track from its average speed', () => {
    const r = racerAt(1, 10);
    r.progress.distance = 100;
    const [res] = buildResults([r], 20, 3, 600);
    expect(res.projected).toBe(true);
    expect(res.time).toBeCloseTo(20 + (1800 - 100) / 5, 5);
    expect(res.best).toBeNull();
  });

  it('has no time for an unfinished racer when the race has no lap limit', () => {
    const r = racerAt(1, 10);
    r.progress.distance = 100;
    const [res] = buildResults([r], 20, Infinity, 600);
    expect(res).toMatchObject({ time: null, projected: false });
  });

  it('has no projection for a racer that has barely moved', () => {
    const r = racerAt(1, 10);
    r.progress.distance = 10;
    expect(buildResults([r], 20, 3, 600)[0]).toMatchObject({ time: null, projected: true });
  });

  it('carries the knock-out time and keeps the order it is given', () => {
    const a = racerAt(1, 10), b = racerAt(2, 20);
    b.outAt = 38;
    const res = buildResults([b, a], 40, Infinity, 600);
    expect(res.map(x => x.name)).toEqual(['R2', 'R1']);
    expect(res[0].out).toBe(38);
    expect(res[1].out).toBeNull();
  });

  it('gives a racer who was knocked out its knock-out time and no finish time, even with a lap limit', () => {
    const r = racerAt(1, 10);
    r.progress.distance = 100;
    r.outAt = 38;
    expect(buildResults([r], 40, 3, 600)[0]).toMatchObject({ out: 38, time: null, projected: false });
  });

  it('shows a racer still in during an elimination with no time and not out', () => {
    const r = racerAt(1, 10);
    r.progress.distance = 100;
    expect(buildResults([r], 40, Infinity, 600)[0]).toMatchObject({ out: null, time: null, projected: false });
  });
});
