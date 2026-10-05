import { describe, expect, it } from 'vitest';
import { payoutLine } from './Stars';

describe('payoutLine', () => {
  it('reads place, stars and naira', () => {
    expect(payoutLine(2, 2, 60_000)).toBe('2nd place: ★★ = ₦60,000');
    expect(payoutLine(1, 3, 100_000)).toBe('1st place: ★★★ = ₦100,000');
  });
  it('says no stars when there are none', () => {
    expect(payoutLine(5, 0, 0)).toBe('5th place: no stars = ₦0');
  });
  it('falls back to a th ordinal beyond 6th', () => {
    expect(payoutLine(7, 0, 0)).toBe('7th place: no stars = ₦0');
  });
});
