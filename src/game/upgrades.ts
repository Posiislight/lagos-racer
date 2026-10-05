import { VEHICLES, type VehicleConfig, type VehicleId } from '../config/vehicles';
import { MAX_UPGRADE_LEVEL, STAT_BAR_STEP, UPGRADE_STEPS } from '../config/economy';

/** You upgrade the stats themselves: the same three the Garage bars show. */
export type UpgradeKind = 'speed' | 'handling' | 'toughness';
export const UPGRADE_KINDS: UpgradeKind[] = ['speed', 'handling', 'toughness'];

export type UpgradeLevels = Record<UpgradeKind, number>;
export const NO_UPGRADES: UpgradeLevels = { speed: 0, handling: 0, toughness: 0 };

/** Levels bought for each vehicle. A vehicle with no entry has no upgrades. */
export type UpgradeMap = Partial<Record<VehicleId, UpgradeLevels>>;

export const UPGRADE_LABEL: Record<UpgradeKind, string> = { speed: 'Speed', handling: 'Handling', toughness: 'Toughness' };

export const levelsFor = (map: UpgradeMap, id: VehicleId): UpgradeLevels => map[id] ?? NO_UPGRADES;

/** The vehicle as it drives with these upgrades. Returns a new config; the base is never changed. */
export function applyUpgrades(base: VehicleConfig, levels: UpgradeLevels): VehicleConfig {
  const t = base.tuning, { speed, handling, toughness } = UPGRADE_STEPS;
  const shown = displayStats(base, levels);
  return {
    ...base,
    stats: {
      speed: shown.speed.base + shown.speed.bonus,
      handling: shown.handling.base + shown.handling.bonus,
      toughness: shown.toughness.base + shown.toughness.bonus,
    },
    tuning: {
      ...t,
      topSpeed: t.topSpeed * (1 + speed.topSpeed * levels.speed),
      accel: t.accel * (1 + speed.accel * levels.speed),
      grip: t.grip * (1 + handling.grip * levels.handling),
      steerAtSpeed: Math.min(1, t.steerAtSpeed * (1 + handling.steerAtSpeed * levels.handling)),
      brake: t.brake * (1 + handling.brake * levels.handling),
      impact: t.impact * (1 + toughness.impact * levels.toughness),
      mass: t.mass * (1 + toughness.mass * levels.toughness),
    },
  };
}

/** Top speed with every upgrade bought. Anything that judges "too fast to be real" (the room referee) must use this, not the base. */
export const maxTopSpeed = (base: VehicleConfig): number =>
  applyUpgrades(base, { speed: MAX_UPGRADE_LEVEL, handling: MAX_UPGRADE_LEVEL, toughness: MAX_UPGRADE_LEVEL }).tuning.topSpeed;

/** Garage stat bars: the base value out of 10 plus what upgrades add, never past 10 in total. */
export function displayStats(base: VehicleConfig, levels: UpgradeLevels) {
  const bar = (value: number, level: number) => ({ base: value, bonus: Math.min(10 - value, STAT_BAR_STEP * level) });
  return {
    speed: bar(base.stats.speed, levels.speed),
    handling: bar(base.stats.handling, levels.handling),
    toughness: bar(base.stats.toughness, levels.toughness),
  };
}

/** Turn whatever was in the saved file into valid levels: unknown vehicles dropped, bad numbers become 0. */
export function sanitizeUpgrades(raw: unknown): UpgradeMap {
  const out: UpgradeMap = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const { id } of VEHICLES) {
    const entry = (raw as Record<string, unknown>)[id];
    if (typeof entry !== 'object' || entry === null) continue;
    const level = (kind: UpgradeKind) => {
      const n = (entry as Record<string, unknown>)[kind];
      return typeof n === 'number' && Number.isInteger(n) ? Math.min(MAX_UPGRADE_LEVEL, Math.max(0, n)) : 0;
    };
    out[id] = { speed: level('speed'), handling: level('handling'), toughness: level('toughness') };
  }
  return out;
}
