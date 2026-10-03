import { describe, expect, it } from 'vitest';
import { migrateSave } from './save';

describe('migrateSave (v1 → v2)', () => {
  it('migrates the blue okada to an okada painted blue', () => {
    const s = migrateSave({ vehicle: 'okada-blue', unlocked: [] });
    expect(s.vehicle).toBe('okada');
    expect(s.paint.okada).toBe('blue');
  });

  it('migrates the red BRT and its unlock', () => {
    const s = migrateSave({ vehicle: 'brt-red', unlocked: ['brt-red'] });
    expect(s.vehicle).toBe('brt');
    expect(s.unlocked).toEqual(['brt']);
    expect(s.paint.brt).toBe('red');
  });

  it('keeps coins and races, and unlocks the BRT once for either old BRT', () => {
    const s = migrateSave({ vehicle: 'danfo', unlocked: ['brt-blue', 'brt-red'], coins: 640, races: 5 });
    expect(s.vehicle).toBe('danfo');
    expect(s.unlocked).toEqual(['brt']);
    expect(s.coins).toBe(640);
    expect(s.races).toBe(5);
  });

  it('drops the old Ojuelegba best lap (the track changed)', () => {
    expect(migrateSave({ best: { ojuelegba: 61.2 } }).best).toEqual({});
  });

  it('survives junk', () => {
    for (const junk of [null, 'x', 42, { vehicle: 'helicopter', unlocked: 'all' }]) {
      const s = migrateSave(junk);
      expect(s.vehicle).toBe('okada');
      expect(s.unlocked).toEqual([]);
      expect(s.itemHints).toBe(0);
    }
  });
});
