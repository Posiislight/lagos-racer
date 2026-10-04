import { CHAPTER_1, QUICK_COINS, type RaceSpec } from '../config/campaign';
import { driverById, type DriverId } from '../config/drivers';

/** Coins for a 1-based place from a table whose last entry repeats. Nonsense places get the last entry. */
export function coinsForPlace(table: number[], place: number): number {
  const i = Number.isInteger(place) && place >= 1 ? Math.min(place, table.length) - 1 : table.length - 1;
  return table[i];
}

/** Where the player finished in `ranking` (racer ids, best first) and whether that clears the race. */
export function evaluatePass(spec: Pick<RaceSpec, 'pass'>, ranking: number[], playerId: number): { place: number; passed: boolean } {
  const i = ranking.indexOf(playerId);
  if (i < 0) return { place: ranking.length + 1, passed: false };
  return { place: i + 1, passed: i + 1 <= spec.pass.place };
}

export type Settled = { coins: number; passed: boolean; firstClear: boolean; cleared: string[]; unlocked: DriverId | null };

/**
 * What a finished race is worth and what it changes. Coins are paid on every attempt by place; the
 * first pass of a campaign race adds its bonus, records the clear and may unlock a driver.
 * `spec` null is a quick race: place coins and nothing else.
 */
export function settle(spec: RaceSpec | null, place: number, cleared: string[]): Settled {
  if (!spec) return { coins: coinsForPlace(QUICK_COINS, place), passed: false, firstClear: false, cleared, unlocked: null };
  const passed = place <= spec.pass.place;
  const firstClear = passed && !cleared.includes(spec.id);
  return {
    coins: coinsForPlace(spec.coins, place) + (firstClear ? spec.firstClearCoins : 0),
    passed,
    firstClear,
    cleared: firstClear ? [...cleared, spec.id] : cleared,
    unlocked: firstClear ? spec.reward?.driver ?? null : null,
  };
}

export type CampaignStop = { spec: RaceSpec; state: 'locked' | 'open' | 'cleared' };

/** Each race is open once the one before it is cleared; the first is always open. */
export function campaignStatus(cleared: string[], chapter: RaceSpec[] = CHAPTER_1): CampaignStop[] {
  return chapter.map((spec, i) => ({
    spec,
    state: cleared.includes(spec.id) ? 'cleared' : i === 0 || cleared.includes(chapter[i - 1].id) ? 'open' : 'locked',
  }));
}

export function nextRace(spec: RaceSpec, chapter: RaceSpec[] = CHAPTER_1): RaceSpec | null {
  return chapter[chapter.findIndex(r => r.id === spec.id) + 1] ?? null;
}

/** The cleared list from anything (a saved game can hold junk): known ids, once each, in chapter order. */
export function sanitizeCleared(raw: unknown, chapter: RaceSpec[] = CHAPTER_1): string[] {
  if (!Array.isArray(raw)) return [];
  return chapter.map(r => r.id).filter(id => raw.includes(id));
}

/** Whether the player may pick this driver: not locked, or the race that unlocks them is cleared. */
export function driverAvailable(id: DriverId, cleared: string[]): boolean {
  const lock = driverById(id).locked;
  return !lock || cleared.includes(lock.race);
}
