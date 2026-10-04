/**
 * Naira: what races pay and what upgrades cost. Every number lives here so the economy is easy to tune.
 * Roughly twelve wins fully upgrade one vehicle (three categories, five levels each).
 */

/** Prize money by finishing place (0-based). Fourth place and below earn nothing. */
export const PAYOUTS = [200_000, 150_000, 100_000];

/** What buying level 1, 2, 3, 4 and 5 of any upgrade costs. The same for every vehicle. */
export const UPGRADE_PRICES = [80_000, 120_000, 160_000, 200_000, 260_000];

export const MAX_UPGRADE_LEVEL = 5;

/** Fraction added per level. Body's impact is negative: knocks and wall scrapes cost less speed. */
export const UPGRADE_STEPS = {
  engine: { topSpeed: 0.04, accel: 0.06 },
  tyres: { grip: 0.04, steerAtSpeed: 0.03, brake: 0.04 },
  body: { impact: -0.1, mass: 0.03 },
};

/** How much one upgrade level adds to its stat bar in the Garage (out of 10). */
export const STAT_BAR_STEP = 0.4;

export function payoutForPlace(place: number): number {
  return PAYOUTS[place] ?? 0;
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
