import { create } from 'zustand';
import { VEHICLES, type VehicleId } from '../config/vehicles';
import { driverAvailable, settle } from './campaign';
import { CHAPTER_1, type RaceSpec } from '../config/campaign';
import type { DriverId } from '../config/drivers';
import type { ItemKind } from './runtime';
import { loadSave, writeSave, type Saved, type Settings } from './save';

export type { Quality, Settings } from './save';
export type Screen = 'menu' | 'garage' | 'race' | 'campaign';

/**
 * time is the finish time, or a projection from average speed (projected: true) for racers still on track.
 * color: their paint. out: race clock seconds when knocked out (elimination), else null.
 */
export type Result = { name: string; vehicle: VehicleId; color: string; time: number | null; projected: boolean; best: number | null; isPlayer: boolean; out: number | null };

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
// Reviewer shortcut: ?unlock=all opens every vehicle without grinding coins.
if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('unlock') === 'all') initial.unlocked = ['brt'];
if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('unlock') === 'all') initial.campaign = { cleared: CHAPTER_1.map(s => s.id) };

export type State = Saved & {
  screen: Screen;
  raceId: number;
  /** The campaign race being run (null for a quick race). */
  spec: RaceSpec | null;
  /** How the last race went, for the results card (null for a quick race). */
  outcome: Outcome | null;
  paused: boolean;
  hud: Hud;
  results: Result[] | null;
  coinsEarned: number;
  showAccountPrompt: boolean;
  setScreen: (s: Screen) => void;
  setTrack: (id: string) => void;
  setVehicle: (v: VehicleId) => void;
  setPaint: (v: VehicleId, paint: string) => void;
  setDriver: (d: DriverId) => void;
  /** One more pickup has shown its how-to hint. */
  countItemHint: () => void;
  unlock: (v: VehicleId) => void;
  setSetting: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  /** Start a campaign race, or a quick race when no spec is given. */
  startRace: (spec?: RaceSpec) => void;
  quitRace: () => void;
  setPaused: (p: boolean) => void;
  setHud: (h: Partial<Hud>) => void;
  flash: (message: string) => void;
  /** `place` is the player's 1-based finishing place. */
  finishRace: (results: Result[], place: number, bestLap: number | null) => void;
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
  paused: false,
  hud: emptyHud(),
  results: null,
  coinsEarned: 0,
  showAccountPrompt: false,
  setScreen: screen => set({ screen }),
  setTrack: track => { set({ track }); save(); },
  setVehicle: vehicle => { set({ vehicle }); save(); },
  setPaint: (v, paint) => { set(s => ({ paint: { ...s.paint, [v]: paint } })); save(); },
  setDriver: driver => {
    if (!driverAvailable(driver, get().campaign.cleared)) return;
    set({ driver });
    save();
  },
  countItemHint: () => { set(s => ({ itemHints: s.itemHints + 1 })); save(); },
  unlock: v => {
    const s = get(), price = VEHICLES.find(x => x.id === v)?.locked?.coins ?? 0;
    if (s.unlocked.includes(v) || s.coins < price) return;
    set({ coins: s.coins - price, unlocked: [...s.unlocked, v], vehicle: v });
    save();
  },
  setSetting: (k, v) => { set({ settings: { ...get().settings, [k]: v } }); save(); },
  startRace: spec => set(s => ({ screen: 'race', spec: spec ?? null, outcome: null, raceId: s.raceId + 1, paused: false, results: null, hud: emptyHud(), coinsEarned: 0, showAccountPrompt: false })),
  quitRace: () => set({ screen: 'menu', paused: false, results: null }),
  setPaused: paused => set({ paused }),
  setHud: h => set(s => ({ hud: { ...s.hud, ...h } })),
  flash: message => set(s => ({ hud: { ...s.hud, message, messageKey: s.hud.messageKey + 1 } })),
  finishRace: (results, place, bestLap) => {
    const s = get();
    const settled = settle(s.spec, place, s.campaign.cleared);
    // The best lap belongs to the track the race was run on, which a campaign race picks for itself.
    const trackId = s.spec?.track ?? s.track;
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
    accountPromptDismissed: s.accountPromptDismissed, paint: s.paint, itemHints: s.itemHints, driver: s.driver, track: s.track,
    campaign: s.campaign,
  });
}
