/**
 * Naira: what races pay and what upgrades cost. Every number lives here so the economy is easy to tune.
 * Races pay by stars (0 to 3), earned by finishing place. A podium averages about ₦63,000, so fully
 * upgrading one vehicle (three categories, five levels each) takes about 39 podium races.
 */

export type Stars = 0 | 1 | 2 | 3;

/** Stars by finishing place (1-based: first place is entry 0). Places beyond the table earn none. */
export const DEFAULT_STARS: number[] = [3, 2, 1];

/** Prize money by star count. */
export const PAYOUT_BY_STARS = [0, 30_000, 60_000, 100_000] as const;

/** Room races pay this fraction of the star payout, up to the daily cap. */
export const ROOM_PAYOUT_MULTIPLIER = 0.5;
export const ROOM_DAILY_CAP = 300_000;

/** What buying level 1, 2, 3, 4 and 5 of any upgrade costs. The same for every vehicle. */
export const UPGRADE_PRICES = [80_000, 120_000, 160_000, 200_000, 260_000];

export const MAX_UPGRADE_LEVEL = 5;

/**
 * What each stat upgrade does to the tuning, as a fraction added per level. Toughness's impact is
 * negative: crashes and wall scrapes cost less speed.
 */
export const UPGRADE_STEPS = {
  speed: { topSpeed: 0.04, accel: 0.06 },
  handling: { grip: 0.04, steerAtSpeed: 0.03, brake: 0.04 },
  toughness: { impact: -0.1, mass: 0.03 },
};

/** How much one upgrade level adds to its stat bar in the Garage (out of 10). */
export const STAT_BAR_STEP = 0.4;

/** Stars for a 1-based finishing place; 0 beyond the table or for a nonsense place. */
export function starsForPlace(table: number[], place: number): Stars {
  if (!Number.isInteger(place) || place < 1) return 0;
  return (table[place - 1] ?? 0) as Stars;
}

export function payoutForStars(stars: number): number {
  return Number.isInteger(stars) ? (PAYOUT_BY_STARS[stars] ?? 0) : 0;
}

/**
 * What a room race pays a player who has already earned `earnedToday` from rooms. `capped` is true
 * when the daily cap cut a payout that would otherwise have been above 0.
 */
export function roomPayout(place: number, dnf: boolean, earnedToday: number): { naira: number; capped: boolean } {
  const base = dnf ? 0 : Math.floor(payoutForStars(starsForPlace(DEFAULT_STARS, place)) * ROOM_PAYOUT_MULTIPLIER);
  const naira = Math.min(base, Math.max(0, ROOM_DAILY_CAP - earnedToday));
  return { naira, capped: base > 0 && naira < base };
}

/** Price of the level after `level` (0 to 4), or null when there is nothing left to buy. */
export function upgradePrice(level: number): number | null {
  return UPGRADE_PRICES[level] ?? null;
}

export function formatNaira(n: number): string {
  if (!(n > 0)) return '₦0';
  if (n < 1_000_000) return `₦${Math.floor(n).toLocaleString('en-US')}`;
  return `₦${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}
