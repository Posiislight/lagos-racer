import { CHAPTER_1, type RaceSpec } from '../config/campaign';
import { driverById, type DriverId } from '../config/drivers';
import { DEFAULT_STARS, payoutForStars, starsForPlace, type Stars } from '../config/economy';

/** Where the player finished in `ranking` (racer ids, best first) and whether that clears the race. */
export function evaluatePass(spec: Pick<RaceSpec, 'pass'>, ranking: number[], playerId: number): { place: number; passed: boolean } {
  const i = ranking.indexOf(playerId);
  if (i < 0) return { place: ranking.length + 1, passed: false };
  return { place: i + 1, passed: i + 1 <= spec.pass.place };
}

/** What the campaign remembers: which races are cleared and the best stars on each. */
export type CampaignSave = { cleared: string[]; stars: Record<string, Stars> };

export type Settled = {
  /** Stars this run earned (0 to 3). */
  stars: Stars;
  /** Naira for this run, paid on every attempt. */
  payout: number;
  /** This run beat the previous best (no previous counts as 0) and earned at least one star. */
  newBest: boolean;
  passed: boolean;
  firstClear: boolean;
  saved: CampaignSave;
  unlocked: DriverId | null;
};

/**
 * What a finished race is worth and what it changes. Every attempt pays by the stars it earned; the
 * best stars are kept, the first run with at least one star records the clear and may unlock a driver.
 */
export function settle(spec: RaceSpec, place: number, saved: CampaignSave): Settled {
  const stars = starsForPlace(spec.stars ?? DEFAULT_STARS, place);
  const previous = saved.stars[spec.id] ?? 0;
  const firstClear = stars >= 1 && !saved.cleared.includes(spec.id);
  return {
    stars,
    payout: payoutForStars(stars),
    newBest: stars >= 1 && stars > previous,
    passed: Number.isInteger(place) && place >= 1 && place <= spec.pass.place,
    firstClear,
    saved: {
      cleared: firstClear ? [...saved.cleared, spec.id] : saved.cleared,
      stars: stars >= 1 ? { ...saved.stars, [spec.id]: Math.max(previous, stars) as Stars } : saved.stars,
    },
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

/** Best stars from anything (a saved game can hold junk): known ids only, integer values 1 to 3. */
export function sanitizeStars(raw: unknown, chapter: RaceSpec[] = CHAPTER_1): Record<string, Stars> {
  const out: Record<string, Stars> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  const map = raw as Record<string, unknown>;
  for (const { id } of chapter) {
    const v = map[id];
    if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 3) out[id] = v as Stars;
  }
  return out;
}

/** Whether the player may pick this driver: not locked, or the race that unlocks them is cleared. */
export function driverAvailable(id: DriverId, cleared: string[]): boolean {
  const lock = driverById(id).locked;
  return !lock || cleared.includes(lock.race);
}
