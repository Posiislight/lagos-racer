import { describe, expect, it } from 'vitest';
import { emptyControls, queueSpecial, readPlayer, resetPlayerInput, swallowKey, touch } from './input';

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

describe('the special button', () => {
  const opts = { tilt: false, invertTilt: false };

  it('sets the special control from a touch press and clears the touch flag', () => {
    resetPlayerInput();
    const c = emptyControls();
    touch.special = true;
    readPlayer(c, 0.016, opts);
    expect(c.special).toBe(true);
    expect(touch.special).toBe(false);
    readPlayer(c, 0.016, opts);
    expect(c.special).toBe(false);
  });

  it('sets it once after queueSpecial (the Q key)', () => {
    resetPlayerInput();
    const c = emptyControls();
    queueSpecial();
    readPlayer(c, 0.016, opts);
    expect(c.special).toBe(true);
    readPlayer(c, 0.016, opts);
    expect(c.special).toBe(false);
  });
});
