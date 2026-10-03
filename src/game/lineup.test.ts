import { describe, expect, it } from 'vitest';
import { pickRivals } from './lineup';
import { VEHICLES } from '../config/vehicles';

/** A repeatable random number generator for the tests. */
const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

describe('pickRivals', () => {
  for (const seed of [1, 7, 42, 1234]) {
    it(`picks five distinct rivals covering every vehicle (seed ${seed})`, () => {
      const player = { vehicle: 'okada' as const, paint: 'red' };
      const picks = pickRivals(player, 5, seeded(seed));
      expect(picks).toHaveLength(5);
      for (const v of VEHICLES) expect(picks.some(p => p.vehicle === v.id)).toBe(true);
      expect(picks.some(p => p.vehicle === player.vehicle && p.paint === player.paint)).toBe(false);
      expect(new Set(picks.map(p => `${p.vehicle}/${p.paint}`)).size).toBe(5);
      for (const p of picks) expect(VEHICLES.find(v => v.id === p.vehicle)!.paints.some(x => x.id === p.paint)).toBe(true);
    });
  }
});
