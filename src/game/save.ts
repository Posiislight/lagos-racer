import { VEHICLES, type VehicleId } from '../config/vehicles';
import { TRACKS } from '../config/tracks';
import { DEFAULT_DRIVER, sanitizeDriver, type DriverId } from '../config/drivers';

/**
 * What the game keeps in localStorage between visits. Version 2 has four vehicles with paints; a
 * version 1 save (six vehicles, two of them colour twins) is migrated once on load.
 */
export type Quality = 'low' | 'medium' | 'high';
export type Settings = { quality: Quality; sound: boolean; steering: 'buttons' | 'tilt'; invertTilt: boolean; showFps: boolean };

export type Saved = {
  settings: Settings;
  coins: number;
  best: Record<string, number>;
  races: number;
  vehicle: VehicleId;
  unlocked: VehicleId[];
  accountPromptDismissed: boolean;
  /** Chosen paint id per vehicle (missing: the vehicle's usual colour). */
  paint: Partial<Record<VehicleId, string>>;
  /** How many power-up pickups have shown the full how-to hint. */
  itemHints: number;
  /** The chosen driver (who sits in the vehicle and which special power you get). */
  driver: DriverId;
  /** The chosen track id. */
  track: string;
};

export const SAVE_KEY = 'lagos-racer:v2';
const OLD_KEY = 'lagos-racer:v1';

function detectQuality(): Quality {
  if (typeof navigator === 'undefined') return 'medium';
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
  const cores = navigator.hardwareConcurrency || 4;
  if (mobile && cores <= 6) return 'low';
  return mobile ? 'medium' : 'high';
}

export const defaultSave = (): Saved => ({
  settings: { quality: detectQuality(), sound: true, steering: 'buttons', invertTilt: false, showFps: false },
  coins: 0, best: {}, races: 0, vehicle: 'okada', unlocked: [], accountPromptDismissed: false, paint: {}, itemHints: 0, driver: DEFAULT_DRIVER, track: 'ojuelegba',
});

const IDS = new Set<string>(VEHICLES.map(v => v.id));
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown, fallback: number) => (typeof x === 'number' && isFinite(x) ? x : fallback);

/** Old vehicle ids: the colour twins became one vehicle with a paint. */
const OLD_IDS: Record<string, { vehicle: VehicleId; paint?: string }> = {
  'okada-blue': { vehicle: 'okada', paint: 'blue' },
  'brt-blue': { vehicle: 'brt', paint: 'blue' },
  'brt-red': { vehicle: 'brt', paint: 'red' },
};

/** Fill in anything missing or malformed in a version 2 save. */
export function normaliseSave(raw: Record<string, unknown>): Saved {
  const d = defaultSave();
  const unlocked = Array.isArray(raw.unlocked) ? [...new Set(raw.unlocked.filter((v): v is VehicleId => typeof v === 'string' && IDS.has(v)))] : [];
  return {
    settings: { ...d.settings, ...(isObj(raw.settings) ? raw.settings : {}) } as Settings,
    coins: num(raw.coins, 0),
    best: isObj(raw.best) ? Object.fromEntries(Object.entries(raw.best).filter(([, t]) => typeof t === 'number')) as Record<string, number> : {},
    races: num(raw.races, 0),
    vehicle: typeof raw.vehicle === 'string' && IDS.has(raw.vehicle) ? raw.vehicle as VehicleId : d.vehicle,
    unlocked,
    accountPromptDismissed: raw.accountPromptDismissed === true,
    paint: isObj(raw.paint) ? raw.paint as Saved['paint'] : {},
    itemHints: num(raw.itemHints, 0),
    driver: sanitizeDriver(raw.driver),
    track: typeof raw.track === 'string' && TRACKS.some(t => t.id === raw.track) ? raw.track : d.track,
  };
}

/** Turn a version 1 save (or anything else) into a version 2 save. */
export function migrateSave(v1: unknown): Saved {
  if (!isObj(v1)) return defaultSave();
  const paint: Saved['paint'] = {};
  const old = typeof v1.vehicle === 'string' ? OLD_IDS[v1.vehicle] : undefined;
  if (old?.paint) paint[old.vehicle] = old.paint;
  const unlocked = Array.isArray(v1.unlocked) ? v1.unlocked.map(v => (typeof v === 'string' ? OLD_IDS[v]?.vehicle ?? v : v)) : [];
  // The Ojuelegba track was rebuilt on the real road, so its old best lap no longer means anything.
  const best = isObj(v1.best) ? { ...v1.best } : {};
  delete best.ojuelegba;
  return normaliseSave({ ...v1, vehicle: old?.vehicle ?? v1.vehicle, unlocked, best, paint, itemHints: 0 });
}

/** Read the save: version 2 if there is one, else a migrated version 1, else a fresh start. */
export function loadSave(): Saved {
  try {
    const v2 = localStorage.getItem(SAVE_KEY);
    if (v2) return normaliseSave(JSON.parse(v2));
    const v1 = localStorage.getItem(OLD_KEY);
    return v1 ? migrateSave(JSON.parse(v1)) : defaultSave();
  } catch {
    return defaultSave();
  }
}

export function writeSave(data: Saved) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* private mode: progress just isn't kept */ }
}
