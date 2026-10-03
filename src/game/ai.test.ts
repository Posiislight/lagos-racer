import { describe, expect, it } from 'vitest';
import { sideStep, type Footprint } from './ai';

const HW = 6.5;
const car = (o: Partial<Footprint>): Footprint => ({ lateral: 0, distance: 100, halfLength: 2.2, halfWidth: 0.9, ...o });

describe('sideStep', () => {
  it('moves away from a vehicle right alongside, far enough to clear it', () => {
    const lane = sideStep(car({}), [car({ lateral: 1, distance: 101 })], HW);
    expect(lane).not.toBeNull();
    expect(lane!).toBeLessThanOrEqual(1 - (0.9 + 0.9 + 1));
  });

  it('ignores vehicles well ahead or behind', () => {
    expect(sideStep(car({}), [car({ lateral: 1, distance: 120 })], HW)).toBeNull();
    expect(sideStep(car({}), [car({ lateral: 1, distance: 80 })], HW)).toBeNull();
  });

  it('ignores vehicles alongside that are already clear', () => {
    expect(sideStep(car({}), [car({ lateral: 4, distance: 100 })], HW)).toBeNull();
  });

  it('counts a long bus as alongside along its whole length', () => {
    const bus = car({ lateral: 1.5, distance: 105, halfLength: 4.1, halfWidth: 0.9 });
    expect(sideStep(car({}), [bus], HW)).not.toBeNull();
  });

  it('goes round the other side when the kerb is in the way', () => {
    const lane = sideStep(car({ lateral: -3.5 }), [car({ lateral: -2, distance: 100.5 })], HW);
    expect(lane).toBeCloseTo(-2 + 2.8, 5);
  });
});
