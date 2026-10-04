import { describe, expect, it } from 'vitest';
import { aiSpecial, sideStep, type Footprint } from './ai';
import { aiState } from './runtime';
import { racerAt, raceWith } from './testkit';

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

describe('aiSpecial', () => {
  const none = () => 0;
  /** An AI driver of the given kind standing `s` metres round with a full meter. */
  const driver = (id: number, s: number, kind: 'moshood' | 'mamaput') => {
    const r = racerAt(id, s);
    r.driver = kind; r.charge = 1; r.ai = aiState(0, 1, 2, 0, true);
    return r;
  };

  it('never fires unless the race allows AI specials (only the duel does)', () => {
    for (const kind of ['moshood', 'mamaput'] as const) {
      const r = driver(1, 5, kind), race = raceWith([r, racerAt(2, -20)]);
      r.ai = aiState(0, 1);
      expect(r.ai.special).toBe(false);
      for (let i = 0; i < 40; i++) expect(aiSpecial(r, race, 0.5, none)).toBe(false);
    }
  });

  it('never fires with a part-charged meter', () => {
    const r = driver(1, 5, 'moshood'), race = raceWith([r]);
    r.charge = 0.5;
    for (let i = 0; i < 40; i++) expect(aiSpecial(r, race, 0.5, none)).toBe(false);
  });

  it('Moshood fires on a straight after the short delay', () => {
    const r = driver(1, 5, 'moshood'), race = raceWith([r]);
    expect(aiSpecial(r, race, 0.3, none)).toBe(false);
    expect(aiSpecial(r, race, 0.3, none)).toBe(true);
  });

  it('Moshood holds fire in a bend until he has waited 10 s', () => {
    const r = driver(1, 60, 'moshood'), race = raceWith([r]);
    for (let i = 0; i < 18; i++) expect(aiSpecial(r, race, 0.5, none)).toBe(false); // 9 s
    expect(aiSpecial(r, race, 1.5, none)).toBe(true); // 10.5 s
  });

  it('Mama Put fires with a rival within 30 m behind', () => {
    const r = driver(1, 40, 'mamaput'), race = raceWith([r, racerAt(2, 20)]);
    expect(aiSpecial(r, race, 0.3, none)).toBe(false);
    expect(aiSpecial(r, race, 0.3, none)).toBe(true);
  });

  it('Mama Put waits with nobody behind, then fires after 10 s', () => {
    const r = driver(1, 40, 'mamaput'), race = raceWith([r, racerAt(2, 80)]);
    for (let i = 0; i < 18; i++) expect(aiSpecial(r, race, 0.5, none)).toBe(false);
    expect(aiSpecial(r, race, 1.5, none)).toBe(true);
  });

  it('restarts the delay for the next charge', () => {
    const r = driver(1, 5, 'moshood'), race = raceWith([r]);
    aiSpecial(r, race, 0.3, none);
    expect(r.ai!.specialDelay).toBeCloseTo(0.2, 5);
    r.charge = 0; // fired
    expect(aiSpecial(r, race, 0.1, none)).toBe(false);
    expect(r.ai!.specialDelay).toBe(-1);
    r.charge = 1;
    aiSpecial(r, race, 0.1, () => 1);
    expect(r.ai!.specialDelay).toBeCloseTo(2 - 0.1, 5);
  });
});
