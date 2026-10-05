import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STARS,
  MAX_UPGRADE_LEVEL,
  UPGRADE_PRICES,
  formatNaira,
  payoutForStars,
  roomPayout,
  starsForPlace,
  upgradePrice,
} from './economy';

describe('starsForPlace', () => {
  it('gives three, two and one stars to the podium and none after', () => {
    expect([1, 2, 3, 4, 5, 6].map((p) => starsForPlace(DEFAULT_STARS, p))).toEqual([3, 2, 1, 0, 0, 0]);
  });

  it('gives 0 beyond a short table and for nonsense places', () => {
    expect(starsForPlace([3], 2)).toBe(0);
    for (const p of [0, -1, NaN, 2.5, Infinity]) expect(starsForPlace(DEFAULT_STARS, p)).toBe(0);
  });
});

describe('payoutForStars', () => {
  it('pays by star count', () => {
    expect([0, 1, 2, 3].map(payoutForStars)).toEqual([0, 30_000, 60_000, 100_000]);
  });

  it('pays nothing for invalid star counts', () => {
    expect(payoutForStars(4)).toBe(0);
    expect(payoutForStars(-1)).toBe(0);
    expect(payoutForStars(NaN)).toBe(0);
  });
});

describe('roomPayout', () => {
  it('pays half the star payout by place', () => {
    expect(roomPayout(1, false, 0)).toEqual({ naira: 50_000, capped: false });
    expect(roomPayout(2, false, 0).naira).toBe(30_000);
    expect(roomPayout(3, false, 0).naira).toBe(15_000);
  });

  it('pays nothing for fourth place or a DNF', () => {
    expect(roomPayout(4, false, 0)).toEqual({ naira: 0, capped: false });
    expect(roomPayout(1, true, 0)).toEqual({ naira: 0, capped: false });
  });

  it('trims a payout to the daily cap', () => {
    expect(roomPayout(1, false, 280_000)).toEqual({ naira: 20_000, capped: true });
    expect(roomPayout(1, false, 300_000)).toEqual({ naira: 0, capped: true });
    expect(roomPayout(1, false, 310_000)).toEqual({ naira: 0, capped: true });
    expect(roomPayout(4, false, 300_000)).toEqual({ naira: 0, capped: false });
  });
});

describe('pacing', () => {
  const avgPodium = (100_000 + 60_000 + 30_000) / 3;

  it('puts the first upgrade within two podiums', () => {
    expect(UPGRADE_PRICES[0] / avgPodium).toBeLessThanOrEqual(2);
  });

  it('puts a full build at about 25 to 50 podium races', () => {
    const races = (UPGRADE_PRICES.reduce((a, b) => a + b, 0) * 3) / avgPodium;
    expect(races).toBeGreaterThanOrEqual(25);
    expect(races).toBeLessThanOrEqual(50);
  });

});

describe('upgradePrice', () => {
  it('gives the price of the next level, and null at the top', () => {
    expect([0, 1, 2, 3, 4].map(upgradePrice)).toEqual([80_000, 120_000, 160_000, 200_000, 260_000]);
    expect(upgradePrice(MAX_UPGRADE_LEVEL)).toBeNull();
    expect(upgradePrice(-1)).toBeNull();
  });

  it('prices a full build', () => {
    const category = UPGRADE_PRICES.reduce((a, b) => a + b, 0);
    expect(category).toBe(820_000);
    expect(category * 3).toBe(2_460_000);
  });
});

describe('formatNaira', () => {
  it('groups thousands below one million', () => {
    expect(formatNaira(0)).toBe('₦0');
    expect(formatNaira(200_000)).toBe('₦200,000');
    expect(formatNaira(999_999)).toBe('₦999,999');
  });

  it('abbreviates millions with at most one decimal', () => {
    expect(formatNaira(1_000_000)).toBe('₦1M');
    expect(formatNaira(1_250_000)).toBe('₦1.3M');
    expect(formatNaira(3_000_000)).toBe('₦3M');
  });

  it('shows ₦0 for NaN and negatives', () => {
    expect(formatNaira(NaN)).toBe('₦0');
    expect(formatNaira(-5)).toBe('₦0');
  });
});

