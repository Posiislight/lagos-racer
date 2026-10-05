import { describe, expect, it } from 'vitest';
import { localSize, shouldFakeLandscape, toLocalPoint } from './rotate';

describe('shouldFakeLandscape', () => {
  it('turns the app only on a touch device held upright', () => {
    expect(shouldFakeLandscape(true, true)).toBe(true);
    expect(shouldFakeLandscape(true, false)).toBe(false);
    expect(shouldFakeLandscape(false, true)).toBe(false);
    expect(shouldFakeLandscape(false, false)).toBe(false);
  });
});

// A 390x844 phone held upright: the app is 844 wide and 390 tall once turned, covering the whole screen.
const phone = { left: 0, top: 0, right: 390, bottom: 844 };

describe('toLocalPoint', () => {
  it('is a plain offset when not turned', () => {
    expect(toLocalPoint(30, 50, { left: 10, top: 20, right: 100, bottom: 100 }, false)).toEqual({ x: 20, y: 30 });
  });
  it('maps the screen corners onto the turned app', () => {
    // Screen top-right is the app's top-left; screen bottom-right is its top-right.
    expect(toLocalPoint(390, 0, phone, true)).toEqual({ x: 0, y: 0 });
    expect(toLocalPoint(390, 844, phone, true)).toEqual({ x: 844, y: 0 });
    // Screen top-left is the app's bottom-left.
    expect(toLocalPoint(0, 0, phone, true)).toEqual({ x: 0, y: 390 });
    expect(toLocalPoint(0, 844, phone, true)).toEqual({ x: 844, y: 390 });
  });
});

describe('localSize', () => {
  it('swaps width and height when turned', () => {
    expect(localSize(phone, false)).toEqual({ width: 390, height: 844 });
    expect(localSize(phone, true)).toEqual({ width: 844, height: 390 });
  });
});
