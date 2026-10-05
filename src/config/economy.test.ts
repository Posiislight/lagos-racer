import { describe, expect, it } from 'vitest';
import { MAX_UPGRADE_LEVEL, UPGRADE_PRICES, formatNaira, payoutForPlace, upgradePrice } from './economy';
import { vehicleById } from './vehicles';

describe('payoutForPlace', () => {
  it('pays the top three and nobody else', () => {
    expect([0, 1, 2, 3, 4, 5].map(payoutForPlace)).toEqual([200_000, 150_000, 100_000, 0, 0, 0]);
  });

  it('pays nothing for places outside the table', () => {
    expect(payoutForPlace(-1)).toBe(0);
    expect(payoutForPlace(6)).toBe(0);
    expect(payoutForPlace(NaN)).toBe(0);
  });
});

describe('upgradePrice', () => {
  it('gives the price of the next level, and null at the top', () => {
    expect([0, 1, 2, 3, 4].map(upgradePrice)).toEqual([80_000, 120_000, 160_000, 200_000, 260_000]);
    expect(upgradePrice(MAX_UPGRADE_LEVEL)).toBeNull();
    expect(upgradePrice(-1)).toBeNull();
  });

  it('puts a full build at about twelve wins', () => {
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

describe('vehicle unlock prices', () => {
  it('rescales the BRT to match the payouts', () => {
    expect(vehicleById('brt').locked?.coins).toBe(2_000_000);
  });
});
