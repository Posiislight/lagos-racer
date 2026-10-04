import { describe, expect, it } from 'vitest';
import { vehicleById } from '../config/vehicles';
import { NO_UPGRADES, UPGRADE_KINDS, applyUpgrades, displayStats, levelsFor, maxTopSpeed, sanitizeUpgrades } from './upgrades';

const okada = vehicleById('okada');

describe('applyUpgrades', () => {
  it('leaves a vehicle with no upgrades exactly as it was', () => {
    expect(applyUpgrades(okada, NO_UPGRADES)).toEqual(okada);
  });

  it('speed 5 adds 20% top speed and 30% acceleration, and nothing else', () => {
    const v = applyUpgrades(okada, { ...NO_UPGRADES, speed: 5 });
    expect(v.tuning.topSpeed).toBeCloseTo(33 * 1.2);
    expect(v.tuning.accel).toBeCloseTo(9.5 * 1.3);
    expect(v.tuning.grip).toBe(okada.tuning.grip);
    expect(v.tuning.mass).toBe(okada.tuning.mass);
    expect(v.tuning.impact).toBe(1);
  });

  it('steps are linear per level', () => {
    expect(applyUpgrades(okada, { ...NO_UPGRADES, speed: 2 }).tuning.topSpeed).toBeCloseTo(33 * 1.08);
  });

  it('handling 5 adds grip, steering at speed and braking', () => {
    const v = applyUpgrades(okada, { ...NO_UPGRADES, handling: 5 });
    expect(v.tuning.grip).toBeCloseTo(9 * 1.2);
    expect(v.tuning.brake).toBeCloseTo(9 * 1.2);
    expect(v.tuning.steerAtSpeed).toBeCloseTo(0.38 * 1.15);
  });

  it('never lets steering at speed go past full', () => {
    const base = { ...okada, tuning: { ...okada.tuning, steerAtSpeed: 0.95 } };
    expect(applyUpgrades(base, { ...NO_UPGRADES, handling: 5 }).tuning.steerAtSpeed).toBe(1);
  });

  it('toughness 5 halves the impact penalty and adds 15% mass', () => {
    const v = applyUpgrades(okada, { ...NO_UPGRADES, toughness: 5 });
    expect(v.tuning.impact).toBeCloseTo(0.5);
    expect(v.tuning.mass).toBeCloseTo(260 * 1.15);
  });

  it('raises the vehicle\'s own stats too, capped at 10, so anything reading them sees the upgrade', () => {
    const v = applyUpgrades(okada, { speed: 5, handling: 0, toughness: 5 });
    expect(v.stats.speed).toBe(10);
    expect(v.stats.handling).toBe(9);
    expect(v.stats.toughness).toBeCloseTo(4);
    expect(okada.stats).toEqual({ speed: 9, handling: 9, toughness: 2 });
  });

  it('does not change the base vehicle', () => {
    const before = JSON.stringify(okada);
    const v = applyUpgrades(okada, { speed: 5, handling: 5, toughness: 5 });
    expect(JSON.stringify(okada)).toBe(before);
    expect(v).not.toBe(okada);
  });
});

describe('maxTopSpeed', () => {
  it('is the fastest the vehicle can ever go with every upgrade bought (for the lap-time referee)', () => {
    expect(maxTopSpeed(okada)).toBeCloseTo(33 * 1.2);
    expect(maxTopSpeed(vehicleById('keke'))).toBeCloseTo(27 * 1.2);
  });
});

describe('displayStats', () => {
  it('adds 0.4 per level and caps the bar at 10', () => {
    expect(displayStats(okada, { ...NO_UPGRADES, speed: 5 }).speed).toEqual({ base: 9, bonus: 1 });
    expect(displayStats(vehicleById('keke'), { ...NO_UPGRADES, handling: 3 }).handling.bonus).toBeCloseTo(1.2);
    expect(displayStats(vehicleById('brt-blue'), { ...NO_UPGRADES, toughness: 5 }).toughness.bonus).toBe(0);
  });
});

describe('levelsFor', () => {
  it('falls back to no upgrades', () => {
    expect(levelsFor({}, 'okada')).toEqual(NO_UPGRADES);
    expect(levelsFor({ okada: { speed: 2, handling: 0, toughness: 1 } }, 'okada').speed).toBe(2);
  });
});

describe('sanitizeUpgrades', () => {
  it('clamps levels, zeroes bad values and drops unknown vehicles', () => {
    const raw = {
      okada: { speed: 3, handling: 9, toughness: -2 },
      keke: { speed: 2.5, handling: '4', toughness: NaN },
      ghost: { speed: 5 },
      danfo: 'x',
    };
    expect(sanitizeUpgrades(raw)).toEqual({
      okada: { speed: 3, handling: 5, toughness: 0 },
      keke: { speed: 0, handling: 0, toughness: 0 },
    });
  });

  it('returns nothing for input that is not an object', () => {
    for (const bad of [null, undefined, [], 'x', 7]) expect(sanitizeUpgrades(bad)).toEqual({});
  });
});

it('lists the three categories in garage order', () => {
  expect(UPGRADE_KINDS).toEqual(['speed', 'handling', 'toughness']);
});
