import { VEHICLES, type VehicleConfig, type VehicleId } from '../config/vehicles';
import { MAX_UPGRADE_LEVEL, STAT_BAR_STEP, UPGRADE_STEPS } from '../config/economy';

/** Engine: speed. Tyres: handling. Body: toughness. */
export type UpgradeKind = 'engine' | 'tyres' | 'body';
export const UPGRADE_KINDS: UpgradeKind[] = ['engine', 'tyres', 'body'];

export type UpgradeLevels = Record<UpgradeKind, number>;
export const NO_UPGRADES: UpgradeLevels = { engine: 0, tyres: 0, body: 0 };

/** Levels bought for each vehicle. A vehicle with no entry has no upgrades. */
export type UpgradeMap = Partial<Record<VehicleId, UpgradeLevels>>;

export const UPGRADE_INFO: Record<UpgradeKind, { label: string; blurb: string }> = {
  engine: { label: 'Engine', blurb: 'More top speed and quicker off the line' },
  tyres: { label: 'Tyres', blurb: 'Grip in corners, sharper steering, better brakes' },
  body: { label: 'Body', blurb: 'Crashes and wall scrapes cost less speed' },
};

export const levelsFor = (map: UpgradeMap, id: VehicleId): UpgradeLevels => map[id] ?? NO_UPGRADES;

/** The vehicle as it drives with these upgrades. Returns a new config; the base is never changed. */
export function applyUpgrades(base: VehicleConfig, levels: UpgradeLevels): VehicleConfig {
  const t = base.tuning, { engine, tyres, body } = UPGRADE_STEPS;
  return {
    ...base,
    tuning: {
      ...t,
      topSpeed: t.topSpeed * (1 + engine.topSpeed * levels.engine),
      accel: t.accel * (1 + engine.accel * levels.engine),
      grip: t.grip * (1 + tyres.grip * levels.tyres),
      steerAtSpeed: Math.min(1, t.steerAtSpeed * (1 + tyres.steerAtSpeed * levels.tyres)),
      brake: t.brake * (1 + tyres.brake * levels.tyres),
      impact: t.impact * (1 + body.impact * levels.body),
      mass: t.mass * (1 + body.mass * levels.body),
    },
  };
}

/** Garage stat bars: the base value out of 10 plus what upgrades add, never past 10 in total. */
export function displayStats(base: VehicleConfig, levels: UpgradeLevels) {
  const bar = (value: number, level: number) => ({ base: value, bonus: Math.min(10 - value, STAT_BAR_STEP * level) });
  return {
    speed: bar(base.stats.speed, levels.engine),
    handling: bar(base.stats.handling, levels.tyres),
    toughness: bar(base.stats.toughness, levels.body),
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
    out[id] = { engine: level('engine'), tyres: level('tyres'), body: level('body') };
  }
  return out;
}
