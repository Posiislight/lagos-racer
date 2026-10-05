import { describe, expect, it } from 'vitest';
import { defaultSave, migrateSave, normaliseSave, roomEarnedToday, todayKey } from './save';

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

describe('driver', () => {
  it('keeps a saved driver who is unlocked', () => {
    expect(normaliseSave({ driver: 'mamaput', campaign: { cleared: ['campaign-1-4'] } }).driver).toBe('mamaput');
    expect(normaliseSave({ driver: 'moshood' }).driver).toBe('moshood');
  });

  it('falls back to Moshood when the saved driver is still locked', () => {
    expect(normaliseSave({ driver: 'mamaput' }).driver).toBe('moshood');
    expect(migrateSave({ driver: 'mamaput' }).driver).toBe('moshood');
  });

  it('falls back to Moshood when the driver is missing or junk', () => {
    for (const raw of [{}, { driver: 7 }, { driver: null }, { driver: 'bob' }]) expect(migrateSave(raw).driver).toBe('moshood');
    expect(defaultSave().driver).toBe('moshood');
  });
});

describe('campaign progress', () => {
  it('starts with nothing cleared, also for saves from before the campaign', () => {
    expect(defaultSave().campaign).toEqual({ cleared: [], stars: {} });
    expect(normaliseSave({}).campaign).toEqual({ cleared: [], stars: {} });
  });

  it('survives junk', () => {
    for (const junk of [null, 5, 'x', { cleared: 'all' }, { cleared: [7, null] }]) {
      expect(normaliseSave({ campaign: junk }).campaign).toEqual({ cleared: [], stars: {} });
    }
  });

  it('keeps known race ids once each', () => {
    expect(normaliseSave({ campaign: { cleared: ['nope', 'campaign-1-1', 'campaign-1-1'] } }).campaign)
      .toEqual({ cleared: ['campaign-1-1'], stars: { 'campaign-1-1': 1 } });
  });

  it('gives one star to each race cleared before stars existed', () => {
    expect(normaliseSave({ campaign: { cleared: ['campaign-1-1', 'campaign-1-2'] } }).campaign)
      .toEqual({ cleared: ['campaign-1-1', 'campaign-1-2'], stars: { 'campaign-1-1': 1, 'campaign-1-2': 1 } });
  });

  it('keeps saved stars and fills in the rest', () => {
    expect(normaliseSave({ campaign: { cleared: ['campaign-1-1', 'campaign-1-2'], stars: { 'campaign-1-1': 3 } } }).campaign)
      .toEqual({ cleared: ['campaign-1-1', 'campaign-1-2'], stars: { 'campaign-1-1': 3, 'campaign-1-2': 1 } });
  });

  it('counts a race with stars as cleared', () => {
    const c = normaliseSave({ campaign: { cleared: [], stars: { 'campaign-1-2': 2 } } }).campaign;
    expect(c.cleared).toEqual(['campaign-1-2']);
    expect(c.stars).toEqual({ 'campaign-1-2': 2 });
  });

  it('drops junk stars, and a v1 save starts with none', () => {
    expect(normaliseSave({ campaign: { stars: { 'campaign-1-1': 9, bogus: 2 } } }).campaign).toEqual({ cleared: [], stars: {} });
    expect(migrateSave({ coins: 5 }).campaign).toEqual({ cleared: [], stars: {} });
  });
});

describe('todayKey and room earnings', () => {
  it('gives the local date as YYYY-MM-DD', () => {
    expect(todayKey(new Date(2026, 9, 5, 23, 59))).toBe('2026-10-05');
    expect(todayKey(new Date(2026, 9, 6, 0, 1))).toBe('2026-10-06');
  });

  it('counts room earnings only for the day they were earned', () => {
    const saved = { roomEarned: { day: '2026-10-05', naira: 120_000 } };
    expect(roomEarnedToday(saved, new Date(2026, 9, 5, 12))).toBe(120_000);
    expect(roomEarnedToday(saved, new Date(2026, 9, 6, 12))).toBe(0);
  });

  it('starts empty and survives junk', () => {
    expect(defaultSave().roomEarned).toEqual({ day: '', naira: 0 });
    expect(normaliseSave({ roomEarned: { day: 5, naira: 'x' } }).roomEarned).toEqual({ day: '', naira: 0 });
    expect(normaliseSave({ roomEarned: { day: '2026-10-05', naira: -4 } }).roomEarned).toEqual({ day: '2026-10-05', naira: 0 });
    expect(normaliseSave({ roomEarned: { day: '2026-10-05', naira: Infinity } }).roomEarned.naira).toBe(0);
    expect(normaliseSave({ roomEarned: 'x' }).roomEarned).toEqual({ day: '', naira: 0 });
  });
});

describe('saved track', () => {
  it('keeps a known track id', () => {
    expect(normaliseSave({ track: 'ikorodu' }).track).toBe('ikorodu');
  });
  it('falls back to ojuelegba for an unknown or missing id', () => {
    expect(normaliseSave({ track: 'nowhere' }).track).toBe('ojuelegba');
    expect(normaliseSave({}).track).toBe('ojuelegba');
  });
  it('keeps best laps for each track separately', () => {
    expect(normaliseSave({ best: { ojuelegba: 61.2, ikorodu: 80.5 } }).best).toEqual({ ojuelegba: 61.2, ikorodu: 80.5 });
  });
});
