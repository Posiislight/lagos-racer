import { describe, expect, it } from 'vitest';
import { CHAPTER_1 } from '../config/campaign';
import { TRACKS } from '../config/tracks';
import { campaignStatus, driverAvailable, evaluatePass, nextRace, sanitizeCleared, sanitizeStars, settle, type CampaignSave } from './campaign';

describe('CHAPTER_1', () => {
  it('gets harder race by race', () => {
    expect(CHAPTER_1.slice(0, 3).map(r => r.rivalBoost ?? 0)).toEqual([0, 0.03, 0.06]);
    const m = CHAPTER_1[2].mode;
    expect(m.kind === 'elimination' && m.first < 20).toBe(true);
  });

  it('has the four races in order, two per map', () => {
    expect(CHAPTER_1.map(r => r.id)).toEqual(['campaign-1-1', 'campaign-1-2', 'campaign-1-3', 'campaign-1-4']);
    expect(new Set(CHAPTER_1.map(r => r.id)).size).toBe(4);
    expect(CHAPTER_1.map(r => r.track)).toEqual(['ojuelegba', 'third-mainland', 'ojuelegba', 'ikorodu']);
    for (const r of CHAPTER_1) expect(TRACKS.some(t => t.id === r.track)).toBe(true);
    expect(CHAPTER_1.map(r => r.mode.kind)).toEqual(['laps', 'laps', 'elimination', 'duel']);
  });

  it('pins the pass rules and star tables', () => {
    expect(CHAPTER_1.map(r => r.pass.place)).toEqual([3, 3, 3, 1]);
    expect(CHAPTER_1.map(r => r.stars)).toEqual([undefined, undefined, undefined, [3]]);
  });

  it('keeps Mama Put out of races 1-3 and rewards her for race 4', () => {
    expect(CHAPTER_1.slice(0, 3).map(r => r.excludeDrivers)).toEqual([['mamaput'], ['mamaput'], ['mamaput']]);
    expect(CHAPTER_1[3].excludeDrivers).toBeUndefined();
    expect(CHAPTER_1.map(r => r.reward)).toEqual([undefined, undefined, undefined, { driver: 'mamaput' }]);
    expect(CHAPTER_1.map(r => r.taunts !== undefined)).toEqual([false, false, false, true]);
  });

  it('pins the mode numbers', () => {
    expect(CHAPTER_1[0].mode).toEqual({ kind: 'laps', laps: 3 });
    expect(CHAPTER_1[1].mode).toEqual({ kind: 'laps', laps: 2 });
    expect(CHAPTER_1[2].mode).toEqual({ kind: 'elimination', first: 18, step: 2, floor: 8 });
    expect(CHAPTER_1[3].mode).toEqual({ kind: 'duel', laps: 2, skill: 1.1 });
  });

  it('has story and rule text on every race', () => {
    for (const r of CHAPTER_1) {
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.story.length).toBeGreaterThan(0);
      expect(r.rule.length).toBeGreaterThan(0);
    }
  });
});

describe('evaluatePass', () => {
  const six = [10, 11, 12, 13, 14, 15];
  it('passes inside the place limit', () => {
    expect(evaluatePass({ pass: { place: 3 } }, six, 12)).toEqual({ place: 3, passed: true });
    expect(evaluatePass({ pass: { place: 3 } }, six, 13)).toEqual({ place: 4, passed: false });
  });
  it('a duel needs the win', () => {
    expect(evaluatePass({ pass: { place: 1 } }, [10, 11], 10)).toEqual({ place: 1, passed: true });
    expect(evaluatePass({ pass: { place: 1 } }, [10, 11], 11)).toEqual({ place: 2, passed: false });
  });
  it('a player missing from the ranking is last and fails', () => {
    expect(evaluatePass({ pass: { place: 3 } }, six, 99)).toEqual({ place: 7, passed: false });
  });
});

describe('settle', () => {
  const [r1, , , r4] = CHAPTER_1;
  const fresh: CampaignSave = { cleared: [], stars: {} };
  const best = (n: 1 | 2 | 3): CampaignSave => ({ cleared: ['campaign-1-1'], stars: { 'campaign-1-1': n } });

  it('a first win earns 3 stars, pays for them and records the clear', () => {
    expect(settle(r1, 1, fresh)).toEqual({
      stars: 3, payout: 100_000, newBest: true, passed: true, firstClear: true, unlocked: null,
      saved: { cleared: ['campaign-1-1'], stars: { 'campaign-1-1': 3 } },
    });
  });
  it('pays by stars for second and third', () => {
    expect(settle(r1, 2, fresh)).toMatchObject({ stars: 2, payout: 60_000, passed: true });
    expect(settle(r1, 3, fresh)).toMatchObject({ stars: 1, payout: 30_000, passed: true });
  });
  it('a failed attempt earns nothing and changes nothing', () => {
    const s = settle(r1, 4, fresh);
    expect(s).toMatchObject({ stars: 0, payout: 0, passed: false, newBest: false, firstClear: false, unlocked: null });
    expect(s.saved).toEqual(fresh);
  });
  it('a replay pays this run but keeps the best', () => {
    const s = settle(r1, 3, best(3));
    expect(s).toMatchObject({ stars: 1, payout: 30_000, newBest: false, firstClear: false });
    expect(s.saved.stars['campaign-1-1']).toBe(3);
  });
  it('a replay that improves the best says so', () => {
    const s = settle(r1, 2, best(1));
    expect(s).toMatchObject({ newBest: true, firstClear: false });
    expect(s.saved.stars['campaign-1-1']).toBe(2);
  });
  it('the duel needs the win and unlocks Mama Put once', () => {
    expect(settle(r4, 1, fresh)).toMatchObject({ stars: 3, payout: 100_000, passed: true, firstClear: true, unlocked: 'mamaput' });
    expect(settle(r4, 2, fresh)).toMatchObject({ stars: 0, payout: 0, passed: false, unlocked: null });
    const again = settle(r4, 1, { cleared: ['campaign-1-4'], stars: { 'campaign-1-4': 3 } });
    expect(again.unlocked).toBeNull();
    expect(again.firstClear).toBe(false);
  });
  it('nonsense places earn nothing', () => {
    for (const p of [0, NaN, 2.5, -1]) expect(settle(r1, p, fresh)).toMatchObject({ stars: 0, payout: 0, passed: false });
  });
});

describe('sanitizeStars', () => {
  it('keeps known ids with integer values 1-3', () => {
    expect(sanitizeStars({ 'campaign-1-1': 3, 'campaign-1-2': 4, 'campaign-1-3': 'x', nope: 2, 'campaign-1-4': 0 })).toEqual({ 'campaign-1-1': 3 });
  });
  it('turns non-objects into an empty record', () => {
    for (const junk of [undefined, 'x', 5, null, [1, 2]]) expect(sanitizeStars(junk)).toEqual({});
  });
});

describe('campaignStatus and nextRace', () => {
  const states = (c: string[]) => campaignStatus(c).map(s => s.state);
  it('opens races in order', () => {
    expect(states([])).toEqual(['open', 'locked', 'locked', 'locked']);
    expect(states(['campaign-1-1'])).toEqual(['cleared', 'open', 'locked', 'locked']);
    expect(states(CHAPTER_1.map(r => r.id))).toEqual(['cleared', 'cleared', 'cleared', 'cleared']);
  });
  it('finds the following race', () => {
    expect(nextRace(CHAPTER_1[0])?.id).toBe('campaign-1-2');
    expect(nextRace(CHAPTER_1[3])).toBeNull();
  });
});

describe('sanitizeCleared', () => {
  it('keeps known unique ids in chapter order', () => {
    expect(sanitizeCleared(['campaign-1-3', 'campaign-1-1', 'campaign-1-1', 'nope', 7, null])).toEqual(['campaign-1-1', 'campaign-1-3']);
  });
  it('turns junk into an empty list', () => {
    for (const junk of [undefined, 'x', {}, 5, null]) expect(sanitizeCleared(junk)).toEqual([]);
  });
});

describe('driverAvailable', () => {
  it('locks Mama Put until race 4 is cleared', () => {
    expect(driverAvailable('moshood', [])).toBe(true);
    expect(driverAvailable('mamaput', [])).toBe(false);
    expect(driverAvailable('mamaput', ['campaign-1-3'])).toBe(false);
    expect(driverAvailable('mamaput', ['campaign-1-4'])).toBe(true);
  });
});
