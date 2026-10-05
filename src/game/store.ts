import { create } from 'zustand';
import { VEHICLES, ownsPaint, paintKey, paintPrice, vehicleById, type VehicleId } from '../config/vehicles';
import { driverAvailable, settle } from './campaign';
import { CHAPTER_1, type RaceSpec } from '../config/campaign';
import type { DriverId } from '../config/drivers';
import type { ItemKind } from './runtime';
import { loadSave, writeSave, type Saved, type Settings } from './save';

export type { Quality, Settings } from './save';
export type Screen = 'menu' | 'garage' | 'campaign' | 'online' | 'lobby' | 'race';

/**
 * time is the finish time, or a projection from average speed (projected: true) for racers still on track.
 * color: their paint. out: race clock seconds when knocked out (elimination), else null.
 * dnf is only set in a room race, for a car the referee threw out or that dropped.
 */
export type Result = { name: string; vehicle: VehicleId; color: string; time: number | null; projected: boolean; best: number | null; isPlayer: boolean; out: number | null; dnf?: boolean };

/** What a finished campaign race meant for the player (null for a quick race). */
export type Outcome = { place: number; passed: boolean; firstClear: boolean; unlocked: DriverId | null };

/** HUD values, refreshed a few times a second by the race loop (not every frame). */
export type Hud = {
  phase: 'loading' | 'countdown' | 'racing' | 'finished';
  countdown: string;
  lap: number;
  laps: number;
  position: number;
  racers: number;
  time: number;
  lapTime: number;
  bestLap: number | null;
  speed: number;
  item: { kind: ItemKind; label: string } | null;
  message: string;
  messageKey: number;
  wrongWay: boolean;
  /** The player's special power: its name, the meter (0..1) and whether it can be fired. */
  special: { name: string; charge: number; ready: boolean };
  /** Elimination only: racers left, the grid size, seconds to the next knock-out and rounds done (null in other races). */
  elimination: { left: number; total: number; timer: number; round: number } | null;
};

const initial = loadSave();
// Reviewer shortcuts (they go when payments land): ?unlock=all opens every vehicle, paint and campaign
// race; ?premium=N sets the premium balance.
const query = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
if (query?.get('unlock') === 'all') {
  initial.unlocked = ['brt'];
  initial.campaign = { cleared: CHAPTER_1.map(s => s.id) };
  initial.ownedPaints = VEHICLES.flatMap(v => v.paints.map(p => paintKey(v.id, p.id)));
}
const premiumParam = Number(query?.get('premium'));
if (query?.has('premium') && Number.isFinite(premiumParam)) initial.premium = Math.max(0, Math.floor(premiumParam));

export type State = Saved & {
  screen: Screen;
  raceId: number;
  /** The campaign race being run (null for a quick race). */
  spec: RaceSpec | null;
  /** How the last race went, for the results card (null for a quick race). */
  outcome: Outcome | null;
  /** True while the race is a room race (Race with friends). */
  online: boolean;
  paused: boolean;
  hud: Hud;
  results: Result[] | null;
  coinsEarned: number;
  showAccountPrompt: boolean;
  setScreen: (s: Screen) => void;
  setTrack: (id: string) => void;
  setVehicle: (v: VehicleId) => void;
  /** Picks a paint the player owns; any other is ignored. */
  setPaint: (v: VehicleId, paint: string) => void;
  /** Buys a paint with premium currency and selects it. False (and no change) if it is free, owned, unknown or too dear. */
  buyPaint: (v: VehicleId, paint: string) => boolean;
  /** One rewarded ad finished for a locked vehicle: unlocks it at its ad count. Returns the new count, or 0 if nothing counted. */
  addAdView: (v: VehicleId) => number;
  setDriver: (d: DriverId) => void;
  /** One more pickup has shown its how-to hint. */
  countItemHint: () => void;
  /** Unlocks a locked vehicle for its premium price. */
  unlock: (v: VehicleId) => void;
  setSetting: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  /** Start a campaign race, or a quick race when no spec is given. */
  startRace: (spec?: RaceSpec) => void;
  startOnlineRace: () => void;
  quitRace: () => void;
  setPaused: (p: boolean) => void;
  setHud: (h: Partial<Hud>) => void;
  flash: (message: string) => void;
  /** `place` is the player's 1-based finishing place. */
  /** `room` is set for a room race: its coins come from the server's results and its best lap is on the room's track. */
  finishRace: (results: Result[], place: number, bestLap: number | null, room?: { coins: number; trackId: string }) => void;
  dismissAccountPrompt: () => void;
};

const emptyHud = (): Hud => ({
  phase: 'loading', countdown: '', lap: 1, laps: 3, position: 1, racers: 1, time: 0, lapTime: 0, bestLap: null,
  speed: 0, item: null, message: '', messageKey: 0, wrongWay: false,
  special: { name: '', charge: 0, ready: false }, elimination: null,
});

export const useGame = create<State>((set, get) => ({
  ...initial,
  screen: 'menu',
  raceId: 0,
  spec: null,
  outcome: null,
  online: false,
  paused: false,
  hud: emptyHud(),
  results: null,
  coinsEarned: 0,
  showAccountPrompt: false,
  setScreen: screen => set({ screen }),
  setTrack: track => { set({ track }); save(); },
  setVehicle: vehicle => { set({ vehicle }); save(); },
  setPaint: (v, paint) => {
    const vehicle = vehicleById(v);
    if (!vehicle.paints.some(p => p.id === paint) || !ownsPaint(get().ownedPaints, vehicle, paint)) return;
    set(s => ({ paint: { ...s.paint, [v]: paint } }));
    save();
  },
  buyPaint: (v, paint) => {
    const s = get(), vehicle = vehicleById(v), price = paintPrice(vehicle, paint);
    if (!vehicle.paints.some(p => p.id === paint) || price === 0 || ownsPaint(s.ownedPaints, vehicle, paint) || s.premium < price) return false;
    set({ premium: s.premium - price, ownedPaints: [...s.ownedPaints, paintKey(v, paint)], paint: { ...s.paint, [v]: paint } });
    save();
    return true;
  },
  addAdView: v => {
    const s = get(), rule = vehicleById(v).locked;
    if (!rule || s.unlocked.includes(v)) return 0;
    const views = (s.adViews[v] ?? 0) + 1;
    set({ adViews: { ...s.adViews, [v]: views }, ...(views >= rule.ads ? { unlocked: [...s.unlocked, v], vehicle: v } : {}) });
    save();
    return views;
  },
  setDriver: driver => {
    if (!driverAvailable(driver, get().campaign.cleared)) return;
    set({ driver });
    save();
  },
  countItemHint: () => { set(s => ({ itemHints: s.itemHints + 1 })); save(); },
  unlock: v => {
    const s = get(), rule = vehicleById(v).locked;
    if (!rule || s.unlocked.includes(v) || s.premium < rule.premium) return;
    set({ premium: s.premium - rule.premium, unlocked: [...s.unlocked, v], vehicle: v });
    save();
  },
  setSetting: (k, v) => { set({ settings: { ...get().settings, [k]: v } }); save(); },
  startRace: spec => set(s => ({ screen: 'race', online: false, spec: spec ?? null, outcome: null, raceId: s.raceId + 1, paused: false, results: null, hud: emptyHud(), coinsEarned: 0, showAccountPrompt: false })),
  // Room races are always on the server's track (see ONLINE_TRACK); the solo track pick is left alone.
  startOnlineRace: () => set(s => ({ screen: 'race', online: true, spec: null, outcome: null, raceId: s.raceId + 1, paused: false, results: null, hud: emptyHud(), coinsEarned: 0, showAccountPrompt: false })),
  quitRace: () => set({ screen: 'menu', online: false, paused: false, results: null }),
  setPaused: paused => set({ paused }),
  setHud: h => set(s => ({ hud: { ...s.hud, ...h } })),
  flash: message => set(s => ({ hud: { ...s.hud, message, messageKey: s.hud.messageKey + 1 } })),
  finishRace: (results, place, bestLap, room) => {
    const s = get();
    const settled = room ? { ...settle(null, place, s.campaign.cleared), coins: room.coins } : settle(s.spec, place, s.campaign.cleared);
    // The best lap belongs to the track the race was run on, which a campaign race picks for itself.
    const trackId = room?.trackId ?? s.spec?.track ?? s.track;
    const best = { ...s.best };
    if (bestLap !== null && (best[trackId] === undefined || bestLap < best[trackId])) best[trackId] = bestLap;
    const races = s.races + 1;
    // Let people play straight away; after their second race, suggest an account to keep coins.
    const showAccountPrompt = races >= 2 && !s.accountPromptDismissed;
    const outcome = s.spec ? { place, passed: settled.passed, firstClear: settled.firstClear, unlocked: settled.unlocked } : null;
    set({ results, coins: s.coins + settled.coins, coinsEarned: settled.coins, outcome, campaign: { cleared: settled.cleared }, best, races, showAccountPrompt });
    save();
  },
  dismissAccountPrompt: () => { set({ accountPromptDismissed: true, showAccountPrompt: false }); save(); },
}));

function save() {
  const s = useGame.getState();
  writeSave({
    settings: s.settings, coins: s.coins, best: s.best, races: s.races, vehicle: s.vehicle, unlocked: s.unlocked,
    accountPromptDismissed: s.accountPromptDismissed, paint: s.paint, premium: s.premium, ownedPaints: s.ownedPaints, adViews: s.adViews, itemHints: s.itemHints, driver: s.driver, track: s.track,
    campaign: s.campaign,
  });
}
