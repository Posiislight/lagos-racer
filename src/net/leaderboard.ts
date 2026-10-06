import { syncBaseUrl } from '../game/sync';
import type { Row } from '../game/leaderboard';

export type Board = { rows: Row[]; me: { rank: number; row: Row } | null; week?: string; lastWinner?: string | null };

async function load(path: string, f: typeof fetch, base: string): Promise<Board | null> {
  try {
    const res = await f(`${base}/leaderboard/${path}`);
    if (!res.ok) return null;
    const body = await res.json();
    return Array.isArray(body?.rows) ? (body as Board) : null;
  } catch {
    return null;
  }
}

/** This week's points board, with where `name` stands. Null when the server cannot say (offline, no database). */
export const fetchWeekly = (name: string, f: typeof fetch = fetch, base: string = syncBaseUrl()) =>
  load(`weekly?name=${encodeURIComponent(name)}`, f, base);

/** One track's best times, with where `name` stands. */
export const fetchTimes = (track: string, name: string, f: typeof fetch = fetch, base: string = syncBaseUrl()) =>
  load(`times?track=${encodeURIComponent(track)}&name=${encodeURIComponent(name)}`, f, base);
