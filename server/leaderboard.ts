import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import type { VehicleId } from '../src/config/vehicles';
import { TRACKS } from '../src/config/tracks';
import { BOARD_SIZE, CACHE_MS } from '../src/config/leaderboard';
import { mergeBoard, playerKey, weekStart, type Entry, type Row } from '../src/game/leaderboard';
import { send } from './saves';

/** A fake player's line: one time on one track and the points for one week. */
export type SeedRow = { key: string; name: string; vehicle: VehicleId; trackId: string; timeMs: number; week: string; points: number };

export interface LeaderboardStore {
  ensureSchema?(): Promise<void>;
  /** A finished Quick race: keep each player's faster time per track and add their points to the week `now` falls in. */
  record(trackId: string, entries: Entry[], now: number): Promise<void>;
  /** Everyone's points for a week (a Monday, YYYY-MM-DD), seeded rows included and unsorted. */
  weekly(week: string): Promise<Row[]>;
  /** Everyone's best time on a track, seeded rows included and unsorted. */
  times(trackId: string): Promise<Row[]>;
  seed(rows: SeedRow[]): Promise<void>;
  clearSeeds(): Promise<void>;
}

type TimeRow = { key: string; name: string; vehicle: VehicleId; timeMs: number; seed: boolean };
type PointsRow = { key: string; name: string; points: number; seed: boolean };

export class MemoryLeaderboardStore implements LeaderboardStore {
  private best = new Map<string, TimeRow & { trackId: string }>();
  private points = new Map<string, PointsRow & { week: string }>();

  async record(trackId: string, entries: Entry[], now: number) {
    const week = weekStart(now);
    for (const e of entries) {
      this.dropSeed(e.key);
      const bestKey = `${e.key}|${trackId}`;
      const had = this.best.get(bestKey);
      if (!had || e.timeMs < had.timeMs) this.best.set(bestKey, { key: e.key, name: e.name, vehicle: e.vehicle, timeMs: e.timeMs, seed: false, trackId });
      const pointsKey = `${e.key}|${week}`;
      const total = this.points.get(pointsKey);
      this.points.set(pointsKey, { key: e.key, name: total?.name ?? e.name, points: (total?.points ?? 0) + e.points, seed: false, week });
    }
  }

  async weekly(week: string): Promise<Row[]> {
    return [...this.points.values()].filter(p => p.week === week).map(p => ({ key: p.key, name: p.name, value: p.points, seed: p.seed }));
  }

  async times(trackId: string): Promise<Row[]> {
    return [...this.best.values()].filter(b => b.trackId === trackId).map(b => ({ key: b.key, name: b.name, value: b.timeMs, vehicle: b.vehicle, seed: b.seed }));
  }

  async seed(rows: SeedRow[]) {
    for (const r of rows) {
      this.best.set(`${r.key}|${r.trackId}`, { key: r.key, name: r.name, vehicle: r.vehicle, timeMs: r.timeMs, seed: true, trackId: r.trackId });
      this.points.set(`${r.key}|${r.week}`, { key: r.key, name: r.name, points: r.points, seed: true, week: r.week });
    }
  }

  async clearSeeds() {
    for (const [k, v] of this.best) if (v.seed) this.best.delete(k);
    for (const [k, v] of this.points) if (v.seed) this.points.delete(k);
  }

  private dropSeed(key: string) {
    for (const [k, v] of this.best) if (v.seed && v.key === key) this.best.delete(k);
    for (const [k, v] of this.points) if (v.seed && v.key === key) this.points.delete(k);
  }
}

export class PgLeaderboardStore implements LeaderboardStore {
  constructor(private pool: Pool) {}

  async ensureSchema() {
    await this.pool.query(`create table if not exists best_times (
      player_key text not null, name text not null, track_id text not null, time_ms integer not null, vehicle text not null,
      set_at timestamptz not null default now(), is_seed boolean not null default false, primary key (player_key, track_id))`);
    await this.pool.query(`create table if not exists weekly_points (
      player_key text not null, name text not null, week_start date not null, points integer not null,
      updated_at timestamptz not null default now(), is_seed boolean not null default false, primary key (player_key, week_start))`);
    await this.pool.query('create index if not exists best_times_track on best_times (track_id, time_ms)');
    await this.pool.query('create index if not exists weekly_points_week on weekly_points (week_start, points desc)');
  }

  async record(trackId: string, entries: Entry[], now: number) {
    if (entries.length === 0) return;
    const week = weekStart(now);
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      for (const e of entries) {
        // A real player taking a seeded nickname replaces the seed.
        await client.query('delete from best_times where player_key = $1 and is_seed', [e.key]);
        await client.query('delete from weekly_points where player_key = $1 and is_seed', [e.key]);
        await client.query(
          `insert into best_times (player_key, name, track_id, time_ms, vehicle) values ($1, $2, $3, $4, $5)
           on conflict (player_key, track_id) do update set name = excluded.name, time_ms = excluded.time_ms, vehicle = excluded.vehicle, set_at = now()
           where excluded.time_ms < best_times.time_ms`,
          [e.key, e.name, trackId, e.timeMs, e.vehicle]);
        await client.query(
          `insert into weekly_points (player_key, name, week_start, points) values ($1, $2, $3, $4)
           on conflict (player_key, week_start) do update set points = weekly_points.points + excluded.points, updated_at = now()`,
          [e.key, e.name, week, e.points]);
      }
      await client.query('commit');
    } catch (err) {
      await client.query('rollback').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async weekly(week: string): Promise<Row[]> {
    const r = await this.pool.query('select player_key, name, points, is_seed from weekly_points where week_start = $1 order by updated_at', [week]);
    return r.rows.map(x => ({ key: x.player_key, name: x.name, value: x.points, seed: x.is_seed }));
  }

  async times(trackId: string): Promise<Row[]> {
    const r = await this.pool.query('select player_key, name, time_ms, vehicle, is_seed from best_times where track_id = $1', [trackId]);
    return r.rows.map(x => ({ key: x.player_key, name: x.name, value: x.time_ms, vehicle: x.vehicle, seed: x.is_seed }));
  }

  async seed(rows: SeedRow[]) {
    for (const r of rows) {
      await this.pool.query(
        `insert into best_times (player_key, name, track_id, time_ms, vehicle, is_seed) values ($1, $2, $3, $4, $5, true)
         on conflict (player_key, track_id) do nothing`,
        [r.key, r.name, r.trackId, r.timeMs, r.vehicle]);
      await this.pool.query(
        `insert into weekly_points (player_key, name, week_start, points, is_seed) values ($1, $2, $3, $4, true)
         on conflict (player_key, week_start) do nothing`,
        [r.key, r.name, r.week, r.points]);
    }
  }

  async clearSeeds() {
    await this.pool.query('delete from best_times where is_seed');
    await this.pool.query('delete from weekly_points where is_seed');
  }
}

export type LeaderboardDeps = { store: LeaderboardStore | null; allowedOrigins: string[]; now?: () => number };

type Ranked = { rank: number; row: Row };
type Cached = { at: number; rows: Row[] };

// One cache per set of deps: a board is reused for CACHE_MS so a busy menu does not hammer Postgres.
const caches = new WeakMap<LeaderboardDeps, Map<string, Cached>>();

async function board(deps: LeaderboardDeps, id: string, load: () => Promise<Row[]>, order: 'asc' | 'desc'): Promise<Row[]> {
  const cache = caches.get(deps) ?? caches.set(deps, new Map()).get(deps)!;
  const now = (deps.now ?? Date.now)();
  const hit = cache.get(id);
  if (hit && now - hit.at < CACHE_MS) return hit.rows;
  const rows = mergeBoard(await load(), order, Infinity);
  cache.set(id, { at: now, rows });
  return rows;
}

/** Where the named player stands in the whole board, not just its top rows. */
function standing(rows: Row[], name: string | null): Ranked | null {
  const key = name ? playerKey(name) : '';
  if (!key) return null;
  const i = rows.findIndex(r => r.key === key);
  return i < 0 ? null : { rank: i + 1, row: rows[i] };
}

/** `GET /leaderboard/weekly?name=` and `GET /leaderboard/times?track=&name=`: public, read-only, and cached for 30 s. */
export async function handleLeaderboardRequest(req: IncomingMessage, res: ServerResponse, deps: LeaderboardDeps): Promise<void> {
  const origin = req.headers.origin;
  if (origin && deps.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') return send(res, 204);
  if (req.method !== 'GET') return send(res, 405);
  const url = new URL(req.url ?? '', 'http://x');
  const name = url.searchParams.get('name');
  const store = deps.store;
  try {
    if (url.pathname === '/leaderboard/weekly') {
      if (!store) return send(res, 503);
      const now = (deps.now ?? Date.now)();
      const week = weekStart(now);
      const rows = await board(deps, `weekly:${week}`, () => store.weekly(week), 'desc');
      const lastWeek = weekStart(now - 7 * 24 * 60 * 60 * 1000);
      const last = await board(deps, `weekly:${lastWeek}`, () => store.weekly(lastWeek), 'desc');
      return send(res, 200, { week, rows: rows.slice(0, BOARD_SIZE), me: standing(rows, name), lastWinner: last[0]?.name ?? null });
    }
    if (url.pathname === '/leaderboard/times') {
      if (!store) return send(res, 503);
      const track = url.searchParams.get('track') ?? '';
      if (!TRACKS.some(t => t.id === track)) return send(res, 200, { track, rows: [], me: null });
      const rows = await board(deps, `times:${track}`, () => store.times(track), 'asc');
      return send(res, 200, { track, rows: rows.slice(0, BOARD_SIZE), me: standing(rows, name) });
    }
  } catch (err) {
    console.error('leaderboard read failed', err);
    return send(res, 503);
  }
  return send(res, 404);
}
