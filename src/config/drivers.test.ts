import { describe, expect, it } from 'vitest';
import { DEFAULT_DRIVER, DRIVERS, SPECIALS, driverById, randomDriver, sanitizeDriver } from './drivers';

describe('DRIVERS', () => {
  it('gives every driver a special with a kind and a positive charge time', () => {
    for (const d of DRIVERS) {
      expect(d.special.chargeTime).toBeGreaterThan(0);
      expect(['push', 'soup']).toContain(d.special.kind);
    }
    expect(new Set(DRIVERS.map(d => d.id)).size).toBe(DRIVERS.length);
  });

  it('pairs Moshood with Push Squad and Mama Put with the soup trail', () => {
    expect(driverById('moshood').special.kind).toBe('push');
    expect(driverById('mamaput').special.kind).toBe('soup');
    expect(DEFAULT_DRIVER).toBe('moshood');
  });

  it('keeps the special numbers the spec fixes', () => {
    expect(SPECIALS.push).toEqual({ duration: 4, topSpeed: 1.18, accel: 1.6 });
    expect(SPECIALS.soup.maxPatches).toBe(40);
    expect(SPECIALS.soup.spacing).toBe(3.5);
  });
});

describe('sanitizeDriver', () => {
  it('falls back to the default for anything that is not a driver id', () => {
    for (const junk of [undefined, null, 7, 'bob', {}, [], 'MAMAPUT']) expect(sanitizeDriver(junk)).toBe('moshood');
  });

  it('keeps a real driver id', () => {
    expect(sanitizeDriver('mamaput')).toBe('mamaput');
    expect(sanitizeDriver('moshood')).toBe('moshood');
  });
});

describe('randomDriver', () => {
  it('maps the random number across the driver list', () => {
    expect(randomDriver(() => 0)).toBe('moshood');
    expect(randomDriver(() => 0.99)).toBe('mamaput');
  });

  it('skips excluded drivers', () => {
    expect(randomDriver(() => 0.99, ['mamaput'])).toBe('moshood');
  });

  it('ignores the exclusion when it would leave nobody', () => {
    expect(randomDriver(() => 0.99, ['moshood', 'mamaput'])).toBe('mamaput');
  });
});

describe('driver lock', () => {
  it('locks Mama Put behind the last race of chapter 1 and nobody else', () => {
    expect(driverById('mamaput').locked).toEqual({ race: 'campaign-1-4' });
    expect(driverById('moshood').locked).toBeUndefined();
  });
});
