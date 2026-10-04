import { describe, expect, it } from 'vitest';
import { bumpShove, type BumpBody } from './bump';

const body = (o: Partial<BumpBody>): BumpBody => ({ x: 0, z: 0, vx: 0, vz: 0, mass: 500, ...o });

describe('bumpShove', () => {
  it('pushes equal masses at rest apart with the minimum shove, half each', () => {
    const s = bumpShove(body({}), body({ z: 2 }));
    expect(s.x).toBeCloseTo(0, 2);
    expect(s.z).toBeCloseTo(-1.5, 2);
  });

  it('throws a light bike hit by a bus well clear', () => {
    const s = bumpShove(body({ mass: 260 }), body({ z: 2, vz: -10, mass: 2400 }));
    expect(s.z).toBeLessThan(-5.4);
    expect(Math.abs(s.x)).toBeLessThan(0.01);
  });

  it('barely moves a bus hit by a bike', () => {
    const s = bumpShove(body({ mass: 2400 }), body({ z: 2, vz: -10, mass: 260 }));
    expect(Math.abs(s.z)).toBeLessThan(0.6);
  });

  it('still gives the minimum shove when the other vehicle is already moving away', () => {
    const s = bumpShove(body({}), body({ z: 2, vz: 5 }));
    expect(Math.abs(s.z)).toBeCloseTo(3 * 0.5, 2);
  });

  it('pushes along the contact normal, not the line between centres (a bike beside a bus\'s rear)', () => {
    // The bus's centre is 4 m ahead and 1.8 m to the side: the centre line is mostly along the road,
    // but the bodies touch side to side, so the shove must be sideways only.
    const s = bumpShove(body({ mass: 260 }), body({ x: 4, z: 1.8, mass: 2400 }), { x: 0, z: -1 });
    expect(Math.abs(s.x)).toBeLessThan(0.01);
    expect(s.z).toBeLessThan(-2.6);
  });

  it('turns a normal given the wrong way round to point away from the other vehicle', () => {
    const s = bumpShove(body({}), body({ z: 2 }), { x: 0, z: 1 });
    expect(s.z).toBeLessThan(0);
  });

  it('copes with two vehicles in exactly the same place', () => {
    const s = bumpShove(body({ vx: 10 }), body({}));
    expect(Number.isFinite(s.x) && Number.isFinite(s.z)).toBe(true);
    expect(Math.hypot(s.x, s.z)).toBeCloseTo(1.5, 2);
  });
});
