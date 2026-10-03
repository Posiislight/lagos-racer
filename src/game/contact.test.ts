import { describe, expect, it } from 'vitest';
import { clampContactSpeed } from './contact';

describe('clampContactSpeed', () => {
  it('leaves speeds under the limit alone', () => {
    expect(clampContactSpeed(3, 4, 10, 0)).toEqual({ vx: 3, vz: 4 });
    // Limit is the remote's speed + 3 when that is higher than the speed before contact.
    expect(clampContactSpeed(0, 22, 5, 20)).toEqual({ vx: 0, vz: 22 });
  });

  it('caps a fling at the remote speed + 3, keeping the direction', () => {
    const { vx, vz } = clampContactSpeed(60, 80, 2, 20);
    expect(Math.hypot(vx, vz)).toBeCloseTo(23);
    expect(vx / vz).toBeCloseTo(0.75);
  });

  it('never slows a car below the speed it had before the contact', () => {
    const { vx, vz } = clampContactSpeed(-40, 0, 27, 10);
    expect(vx).toBeCloseTo(-27);
    expect(vz).toBeCloseTo(0);
  });

  it('handles a standstill', () => {
    expect(clampContactSpeed(0, 0, 0, 0)).toEqual({ vx: 0, vz: 0 });
  });
});
