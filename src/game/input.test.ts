import { describe, expect, it } from 'vitest';
import { swallowKey } from './input';

describe('swallowKey', () => {
  it('stops arrows and Space scrolling the page', () => {
    expect(swallowKey({ key: 'ArrowLeft' })).toBe(true);
    expect(swallowKey({ key: ' ' })).toBe(true);
  });

  it('leaves letters and browser shortcuts alone (drift is C, so Ctrl is free)', () => {
    expect(swallowKey({ key: 'c' })).toBe(false);
    expect(swallowKey({ key: 'd' })).toBe(false);
    expect(swallowKey({ key: 'r' })).toBe(false);
  });
});
