import type { VehicleId } from '../config/vehicles';
import { BOARD_SIZE, POINTS_BY_PLACE, SEED_HIDE_AT } from '../config/leaderboard';
import type { NetResult } from '../net/protocol';

const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** What identifies a player on the boards: their nickname without case or extra spaces. Empty when nothing usable is left. */
export function playerKey(name: string): string {
  return name.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** The Monday (YYYY-MM-DD) of the week `ms` falls in, by Lagos time (UTC+1, no daylight saving). */
export function weekStart(ms: number): string {
  const lagos = ms + LAGOS_OFFSET_MS;
  const daysSinceMonday = (new Date(lagos).getUTCDay() + 6) % 7;
  return new Date(lagos - daysSinceMonday * DAY_MS).toISOString().slice(0, 10);
}

export const pointsFor = (place: number): number => POINTS_BY_PLACE[place - 1] ?? 0;

export type Entry = { key: string; name: string; vehicle: VehicleId; timeMs: number; points: number };

/** One board entry per human who finished, from the referee's results. A key that appears twice keeps its better place. */
export function entriesFromResults(results: NetResult[]): Entry[] {
  const best = new Map<string, Entry & { place: number }>();
  for (const r of results) {
    if (r.ai || r.dnf || r.projected || r.time === null) continue;
    const key = playerKey(r.name);
    if (!key) continue;
    const seen = best.get(key);
    if (seen && seen.place <= r.place) continue;
    best.set(key, { key, name: r.name, vehicle: r.vehicle, timeMs: Math.round(r.time * 1000), points: pointsFor(r.place), place: r.place });
  }
  return [...best.values()].map(({ place: _place, ...entry }) => entry);
}

/** One line of a board: `value` is points on the weekly board and milliseconds on a track's. */
export type Row = { key: string; name: string; value: number; vehicle?: VehicleId; seed: boolean };

/** Seeds and real rows together, sorted and cut to the limit. Seeds disappear once real rows alone fill SEED_HIDE_AT. */
export function mergeBoard(rows: Row[], order: 'asc' | 'desc', limit = BOARD_SIZE): Row[] {
  const real = rows.filter(r => !r.seed).length;
  const kept = real >= SEED_HIDE_AT ? rows.filter(r => !r.seed) : rows;
  const sign = order === 'asc' ? 1 : -1;
  // Array.prototype.sort is stable, so equal values keep their input order.
  return [...kept].sort((a, b) => sign * (a.value - b.value)).slice(0, limit);
}
