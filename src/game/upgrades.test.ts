import { describe, expect, it } from 'vitest';
import { vehicleById } from '../config/vehicles';
import { NO_UPGRADES, UPGRADE_KINDS, applyUpgrades, displayStats, levelsFor, sanitizeUpgrades } from './upgrades';

const okada = vehicleById('okada');

describe('applyUpgrades', () => {
  it('leaves a vehicle with no upgrades exactly as it was', () => {
    expect(applyUpgrades(okada, NO_UPGRADES)).toEqual(okada);
  });

  it('engine 5 adds 20% top speed and 30% acceleration, and nothing else', () => {
    const v = applyUpgrades(okada, { ...NO_UPGRADES, engine: 5 });
    expect(v.tuning.topSpeed).toBeCloseTo(33 * 1.2);
    expect(v.tuning.accel).toBeCloseTo(9.5 * 1.3);
    expect(v.tuning.grip).toBe(okada.tuning.grip);
    expect(v.tuning.mass).toBe(okada.tuning.mass);
    expect(v.tuning.impact).toBe(1);
  });

  it('steps are linear per level', () => {
    expect(applyUpgrades(okada, { ...NO_UPGRADES, engine: 2 }).tuning.topSpeed).toBeCloseTo(33 * 1.08);
  });

  it('tyres 5 adds grip, steering at speed and braking', () => {
    const v = applyUpgrades(okada, { ...NO_UPGRADES, tyres: 5 });
    expect(v.tuning.grip).toBeCloseTo(9 * 1.2);
    expect(v.tuning.brake).toBeCloseTo(9 * 1.2);
    expect(v.tuning.steerAtSpeed).toBeCloseTo(0.38 * 1.15);
  });

  it('never lets steering at speed go past full', () => {
    const base = { ...okada, tuning: { ...okada.tuning, steerAtSpeed: 0.95 } };
    expect(applyUpgrades(base, { ...NO_UPGRADES, tyres: 5 }).tuning.steerAtSpeed).toBe(1);
  });

  it('body 5 halves the impact penalty and adds 15% mass', () => {
    const v = applyUpgrades(okada, { ...NO_UPGRADES, body: 5 });
    expect(v.tuning.impact).toBeCloseTo(0.5);
    expect(v.tuning.mass).toBeCloseTo(260 * 1.15);
  });

  it('does not change the base vehicle', () => {
    const before = JSON.stringify(okada);
    const v = applyUpgrades(okada, { engine: 5, tyres: 5, body: 5 });
    expect(JSON.stringify(okada)).toBe(before);
    expect(v).not.toBe(okada);
  });
});

describe('displayStats', () => {
  it('adds 0.4 per level and caps the bar at 10', () => {
    expect(displayStats(okada, { ...NO_UPGRADES, engine: 5 }).speed).toEqual({ base: 9, bonus: 1 });
    expect(displayStats(vehicleById('keke'), { ...NO_UPGRADES, tyres: 3 }).handling.bonus).toBeCloseTo(1.2);
    expect(displayStats(vehicleById('brt-blue'), { ...NO_UPGRADES, body: 5 }).toughness.bonus).toBe(0);
  });
});

describe('levelsFor', () => {
  it('falls back to no upgrades', () => {
    expect(levelsFor({}, 'okada')).toEqual(NO_UPGRADES);
    expect(levelsFor({ okada: { engine: 2, tyres: 0, body: 1 } }, 'okada').engine).toBe(2);
  });
});

describe('sanitizeUpgrades', () => {
  it('clamps levels, zeroes bad values and drops unknown vehicles', () => {
    const raw = {
      okada: { engine: 3, tyres: 9, body: -2 },
      keke: { engine: 2.5, tyres: '4', body: NaN },
      ghost: { engine: 5 },
      danfo: 'x',
    };
    expect(sanitizeUpgrades(raw)).toEqual({
      okada: { engine: 3, tyres: 5, body: 0 },
      keke: { engine: 0, tyres: 0, body: 0 },
    });
  });

  it('returns nothing for input that is not an object', () => {
    for (const bad of [null, undefined, [], 'x', 7]) expect(sanitizeUpgrades(bad)).toEqual({});
  });
});

it('lists the three categories in garage order', () => {
  expect(UPGRADE_KINDS).toEqual(['engine', 'tyres', 'body']);
});
