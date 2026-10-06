import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryLeaderboardStore, handleLeaderboardRequest, type LeaderboardDeps, type LeaderboardStore, type SeedRow } from './leaderboard';
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

describe('/leaderboard routes', () => {
  let http: Server;
  afterEach(() => new Promise<void>(r => (http ? http.close(() => r()) : r())));

  async function start(store: LeaderboardStore | null, clock: { t: number } = { t: MON }) {
    const deps: LeaderboardDeps = { store, allowedOrigins: ['https://game.example'], now: () => clock.t };
    http = createServer((req, res) => void handleLeaderboardRequest(req, res, deps));
    await new Promise<void>(r => http.listen(0, r));
    return `http://127.0.0.1:${(http.address() as AddressInfo).port}/leaderboard`;
  }
  const racer = (name: string, points: number, timeMs: number): Entry => ({ key: name.toLowerCase(), name, vehicle: 'okada', timeMs, points });

  it('weekly: sorts by points and names last week\'s winner', async () => {
    const s = new MemoryLeaderboardStore();
    await s.record('ojuelegba', [racer('Ada', 7, 80_000), racer('Bola', 10, 82_000)], MON);
    await s.record('ojuelegba', [racer('Old', 10, 90_000)], SUN_NIGHT);
    const url = await start(s);
    const body = await (await fetch(`${url}/weekly`)).json();
    expect(body.week).toBe(WEEK);
    expect(body.rows.map((r: { name: string }) => r.name)).toEqual(['Bola', 'Ada']);
    expect(body.lastWinner).toBe('Old');
    expect(body.me).toBeNull();
  });

  it('times: sorts by time, and finds the named player by key with their rank', async () => {
    const s = new MemoryLeaderboardStore();
    await s.record('ojuelegba', [racer('Ada', 7, 80_000), racer('Bola', 10, 70_000)], MON);
    const url = await start(s);
    const body = await (await fetch(`${url}/times?track=ojuelegba&name=${encodeURIComponent('  ADA ')}`)).json();
    expect(body.rows.map((r: { name: string }) => r.name)).toEqual(['Bola', 'Ada']);
    expect(body.me).toMatchObject({ rank: 2, row: { name: 'Ada', value: 80_000 } });
  });

  it('puts a player outside the top 50 in me with their true rank', async () => {
    const s = new MemoryLeaderboardStore();
    await s.record('ojuelegba', Array.from({ length: 60 }, (_, i) => racer(`P${i}`, 1, 60_000 + i * 100)), MON);
    const url = await start(s);
    const body = await (await fetch(`${url}/times?track=ojuelegba&name=P57`)).json();
    expect(body.rows).toHaveLength(50);
    expect(body.me.rank).toBe(58);
  });

  it('an unknown track or a missing name is a 200 with nothing in it', async () => {
    const s = new MemoryLeaderboardStore();
    await s.record('ojuelegba', [racer('Ada', 7, 80_000)], MON);
    const url = await start(s);
    const unknown = await fetch(`${url}/times?track=nowhere&name=Ada`);
    expect(unknown.status).toBe(200);
    expect(await unknown.json()).toMatchObject({ rows: [], me: null });
    const noName = await (await fetch(`${url}/times?track=ojuelegba`)).json();
    expect(noName.me).toBeNull();
    expect(noName.rows).toHaveLength(1);
  });

  it('503 without a store or when the store fails, 405 for other methods, 404 for other paths', async () => {
    expect((await fetch(`${await start(null)}/weekly`)).status).toBe(503);
    await new Promise<void>(r => http.close(() => r()));
    const broken = new MemoryLeaderboardStore();
    broken.weekly = async () => { throw new Error('down'); };
    expect((await fetch(`${await start(broken)}/weekly`)).status).toBe(503);
    await new Promise<void>(r => http.close(() => r()));
    const url = await start(new MemoryLeaderboardStore());
    expect((await fetch(`${url}/weekly`, { method: 'POST' })).status).toBe(405);
    expect((await fetch(`${url}/other`)).status).toBe(404);
  });

  it('allows the game origin and answers preflight', async () => {
    const url = await start(new MemoryLeaderboardStore());
    const pre = await fetch(`${url}/weekly`, { method: 'OPTIONS', headers: { Origin: 'https://game.example' } });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('https://game.example');
    const other = await fetch(`${url}/weekly`, { headers: { Origin: 'https://evil.example' } });
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('reuses a board for 30 s and asks the store again after that', async () => {
    const s = new MemoryLeaderboardStore();
    let reads = 0;
    const real = s.times.bind(s);
    s.times = async (t: string) => { reads++; return real(t); };
    const clock = { t: MON };
    const url = await start(s, clock);
    await fetch(`${url}/times?track=ojuelegba`);
    clock.t += 29_000;
    await fetch(`${url}/times?track=ojuelegba`);
    expect(reads).toBe(1);
    clock.t += 1_000;
    await fetch(`${url}/times?track=ojuelegba`);
    expect(reads).toBe(2);
  });
});
