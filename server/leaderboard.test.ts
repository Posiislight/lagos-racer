import { describe, expect, it } from 'vitest';
import { MemoryLeaderboardStore, type LeaderboardStore, type SeedRow } from './leaderboard';
import type { Entry } from '../src/game/leaderboard';

const MON = Date.UTC(2026, 9, 5, 12, 0); // Monday 5 Oct 2026, 13:00 Lagos
const SUN_NIGHT = Date.UTC(2026, 9, 4, 22, 0); // Sunday 4 Oct, 23:00 Lagos: still the week of 28 Sep
const WEEK = '2026-10-05';

const entry = (over: Partial<Entry> = {}): Entry => ({ key: 'ada', name: 'Ada', vehicle: 'okada', timeMs: 80_000, points: 10, ...over });
const seedRow = (over: Partial<SeedRow> = {}): SeedRow => ({ key: 'seedy', name: 'Seedy', vehicle: 'keke', trackId: 'ojuelegba', timeMs: 95_000, week: WEEK, points: 12, ...over });

describe.each([['memory', () => new MemoryLeaderboardStore() as LeaderboardStore]])('%s leaderboard store', (_name, make) => {
  it('keeps the faster time and lets a faster one replace it', async () => {
    const s = make();
    await s.record('ojuelegba', [entry({ timeMs: 80_000 })], MON);
    await s.record('ojuelegba', [entry({ timeMs: 90_000, vehicle: 'keke' })], MON);
    expect((await s.times('ojuelegba'))[0]).toMatchObject({ key: 'ada', value: 80_000, vehicle: 'okada' });
    await s.record('ojuelegba', [entry({ timeMs: 70_000, vehicle: 'danfo' })], MON);
    expect((await s.times('ojuelegba'))[0]).toMatchObject({ value: 70_000, vehicle: 'danfo' });
  });

  it('keeps tracks apart', async () => {
    const s = make();
    await s.record('ojuelegba', [entry()], MON);
    expect(await s.times('ikorodu')).toEqual([]);
    expect(await s.times('unknown-track')).toEqual([]);
  });

  it('adds points within a week and keeps weeks apart', async () => {
    const s = make();
    await s.record('ojuelegba', [entry({ points: 10 })], MON);
    await s.record('ikorodu', [entry({ points: 7 })], MON);
    await s.record('ikorodu', [entry({ points: 5 })], SUN_NIGHT);
    expect((await s.weekly(WEEK))[0]).toMatchObject({ key: 'ada', value: 17, seed: false });
    expect((await s.weekly('2026-09-28'))[0]).toMatchObject({ key: 'ada', value: 5 });
  });

  it('flags seeded rows and returns them on both boards', async () => {
    const s = make();
    await s.seed([seedRow()]);
    expect((await s.times('ojuelegba'))[0]).toMatchObject({ key: 'seedy', name: 'Seedy', value: 95_000, vehicle: 'keke', seed: true });
    expect((await s.weekly(WEEK))[0]).toMatchObject({ key: 'seedy', value: 12, seed: true });
  });

  it('removes a seeded row when a real player takes the nickname', async () => {
    const s = make();
    await s.seed([seedRow({ key: 'ada', name: 'Ada' })]);
    await s.record('ojuelegba', [entry()], MON);
    expect((await s.times('ojuelegba')).map(r => r.seed)).toEqual([false]);
    expect((await s.weekly(WEEK)).map(r => r.seed)).toEqual([false]);
  });

  it('clearSeeds removes only seeded rows', async () => {
    const s = make();
    await s.seed([seedRow()]);
    await s.record('ojuelegba', [entry()], MON);
    await s.clearSeeds();
    expect((await s.times('ojuelegba')).map(r => r.key)).toEqual(['ada']);
    expect((await s.weekly(WEEK)).map(r => r.key)).toEqual(['ada']);
  });
});
