import { VEHICLES, ownsPaint, paintKey, vehicleById, type VehicleId } from '../config/vehicles';
import { TRACKS } from '../config/tracks';
import { DEFAULT_DRIVER, sanitizeDriver, type DriverId } from '../config/drivers';
import { driverAvailable, sanitizeCleared, sanitizeStars, type CampaignSave } from './campaign';
import { sanitizeUpgrades, type UpgradeMap } from './upgrades';

/**
 * What the game keeps in localStorage between visits. Version 2 has four vehicles with paints; a
 * version 1 save (six vehicles, two of them colour twins) is migrated once on load. Campaign stars
 * and room earnings were added to version 2 without changing the key: a save without them loads
 * with one star per race already cleared and no room earnings.
 */
export type Quality = 'low' | 'medium' | 'high';
/** quality is the level in use; with autoQuality on, the race lowers it when the device can't keep up. */
export type Settings = { quality: Quality; autoQuality: boolean; sound: boolean; steering: 'buttons' | 'tilt'; invertTilt: boolean; showFps: boolean };

export type Saved = {
  settings: Settings;
  coins: number;
  best: Record<string, number>;
  races: number;
  vehicle: VehicleId;
  unlocked: VehicleId[];
  /** Stat upgrade levels bought per vehicle. */
  upgrades: UpgradeMap;
  accountPromptDismissed: boolean;
  /** Chosen paint id per vehicle (missing: the vehicle's usual colour). Always a paint the player owns. */
  paint: Partial<Record<VehicleId, string>>;
  /** Premium currency balance. */
  premium: number;
  /** How many of the Gems this phone bought with real money (the server's lifetime total for its buyer id) have been added to `premium` already. Not synced. */
  gemsClaimed: number;
  /** The same for in-game naira bought with real money (added to `coins`). Not synced. */
  coinsClaimed: number;
  /** Bought paints as `vehicle/paint` keys (the usual paint of each vehicle is always owned). */
  ownedPaints: string[];
  /** Rewarded ads watched toward unlocking a locked vehicle. */
  adViews: Partial<Record<VehicleId, number>>;
  /** The first-race how-to card has been seen (or skipped) on this phone. */
  onboarded: boolean;
  /** How many power-up pickups have shown the full how-to hint. */
  itemHints: number;
  /** The chosen driver (who sits in the vehicle and which special power you get). */
  driver: DriverId;
  /** The chosen track id. */
  track: string;
  /** Campaign progress: ids of the races passed so far, and the stars (1 to 3) earned in each. */
  campaign: CampaignSave;
  /** Naira earned in friends' rooms on one local day (the daily cap resets when the day changes). */
  roomEarned: { day: string; naira: number };
};

export const SAVE_KEY = 'lagos-racer:v2';
const OLD_KEY = 'lagos-racer:v1';

export const defaultSave = (): Saved => ({
  settings: { quality: 'high', autoQuality: false, sound: true, steering: 'buttons', invertTilt: false, showFps: false },
  coins: 0, best: {}, races: 0, vehicle: 'danfo', unlocked: [], upgrades: {}, accountPromptDismissed: false, onboarded: false, paint: {}, premium: 0, gemsClaimed: 0, coinsClaimed: 0, ownedPaints: [], adViews: {}, itemHints: 0, driver: DEFAULT_DRIVER, track: 'ojuelegba', campaign: { cleared: [], stars: {} }, roomEarned: { day: '', naira: 0 },
});

const IDS = new Set<string>(VEHICLES.map(v => v.id));
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown, fallback: number) => (typeof x === 'number' && isFinite(x) ? x : fallback);

/** The local date as YYYY-MM-DD. */
export function todayKey(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Naira earned in rooms today (0 if the saved amount is from an earlier day). */
export function roomEarnedToday(saved: Pick<Saved, 'roomEarned'>, now: Date = new Date()): number {
  return saved.roomEarned.day === todayKey(now) ? saved.roomEarned.naira : 0;
}

/** Old vehicle ids: the colour twins became one vehicle with a paint. */
const OLD_IDS: Record<string, { vehicle: VehicleId; paint?: string }> = {
  'okada-blue': { vehicle: 'okada', paint: 'blue' },
  'brt-blue': { vehicle: 'brt', paint: 'blue' },
  'brt-red': { vehicle: 'brt', paint: 'red' },
};

const paintExists = (vehicle: string, paint: string) => IDS.has(vehicle) && vehicleById(vehicle as VehicleId).paints.some(p => p.id === paint);

/** Chosen paints (only real ones) and the bought paints. An older save with no list owns whatever it had chosen. */
function sanitizePaints(rawPaint: unknown, rawOwned: unknown): { paint: Saved['paint']; ownedPaints: string[] } {
  const chosen = Object.entries(isObj(rawPaint) ? rawPaint : {}).filter((e): e is [string, string] => typeof e[1] === 'string' && paintExists(e[0], e[1]));
  const keys = Array.isArray(rawOwned) ? rawOwned.filter((k): k is string => typeof k === 'string' && paintExists(...(k.split('/') as [string, string]))) : chosen.map(([v, p]) => paintKey(v as VehicleId, p));
  const ownedPaints = [...new Set(keys)];
  const paint = Object.fromEntries(chosen.filter(([v, p]) => ownsPaint(ownedPaints, vehicleById(v as VehicleId), p))) as Saved['paint'];
  return { paint, ownedPaints };
}

/** Ad views per locked vehicle, whole numbers up to the number of ads it asks for. */
function sanitizeAdViews(raw: unknown): Saved['adViews'] {
  const out: Saved['adViews'] = {};
  if (!isObj(raw)) return out;
  for (const v of VEHICLES) {
    const n = Math.floor(num(raw[v.id], 0));
    if (v.locked && n > 0) out[v.id] = Math.min(n, v.locked.ads);
  }
  return out;
}

/** Fill in anything missing or malformed in a version 2 save. */
export function normaliseSave(raw: Record<string, unknown>): Saved {
  const d = defaultSave();
  const unlocked = Array.isArray(raw.unlocked) ? [...new Set(raw.unlocked.filter((v): v is VehicleId => typeof v === 'string' && IDS.has(v)))] : [];
  const rawCampaign = isObj(raw.campaign) ? raw.campaign : {};
  const stars = sanitizeStars(rawCampaign.stars);
  // A race with stars counts as cleared; a race cleared before stars existed gets one.
  const cleared = sanitizeCleared([...(Array.isArray(rawCampaign.cleared) ? rawCampaign.cleared : []), ...Object.keys(stars)]);
  for (const id of cleared) if (!(id in stars)) stars[id] = 1;
  const rawRoom = isObj(raw.roomEarned) ? raw.roomEarned : {};
  const roomEarned = { day: typeof rawRoom.day === 'string' ? rawRoom.day : '', naira: Math.max(0, num(rawRoom.naira, 0)) };
  const driver = sanitizeDriver(raw.driver);
  const { paint, ownedPaints } = sanitizePaints(raw.paint, raw.ownedPaints);
  return {
    settings: { ...d.settings, ...(isObj(raw.settings) ? raw.settings : {}) } as Settings,
    coins: num(raw.coins, 0),
    best: isObj(raw.best) ? Object.fromEntries(Object.entries(raw.best).filter(([, t]) => typeof t === 'number')) as Record<string, number> : {},
    races: num(raw.races, 0),
    vehicle: typeof raw.vehicle === 'string' && IDS.has(raw.vehicle) ? raw.vehicle as VehicleId : d.vehicle,
    unlocked,
    upgrades: sanitizeUpgrades(raw.upgrades),
    accountPromptDismissed: raw.accountPromptDismissed === true,
    onboarded: raw.onboarded === true,
    paint,
    ownedPaints,
    premium: Math.max(0, Math.floor(num(raw.premium, 0))),
    gemsClaimed: Math.max(0, Math.floor(num(raw.gemsClaimed, 0))),
    coinsClaimed: Math.max(0, Math.floor(num(raw.coinsClaimed, 0))),
    adViews: sanitizeAdViews(raw.adViews),
    itemHints: num(raw.itemHints, 0),
    // A driver the campaign has not unlocked yet falls back to the default.
    driver: driverAvailable(driver, cleared) ? driver : DEFAULT_DRIVER,
    track: typeof raw.track === 'string' && TRACKS.some(t => t.id === raw.track) ? raw.track : d.track,
    campaign: { cleared, stars },
    roomEarned,
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
/** True if this phone has a save from an earlier visit. */
export function hasSave(): boolean {
  try { return localStorage.getItem(SAVE_KEY) !== null || localStorage.getItem(OLD_KEY) !== null; } catch { return false; }
}

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
