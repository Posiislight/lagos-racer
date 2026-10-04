import { create } from 'zustand';
import { VEHICLES, type VehicleId } from '../config/vehicles';
import type { DriverId } from '../config/drivers';
import type { ItemKind } from './runtime';
import { loadSave, writeSave, type Saved, type Settings } from './save';

export type { Quality, Settings } from './save';
export type Screen = 'menu' | 'garage' | 'race';

/** time is the finish time, or a projection from average speed (projected: true) for racers still on track. color: their paint. */
export type Result = { name: string; vehicle: VehicleId; color: string; time: number | null; projected: boolean; best: number | null; isPlayer: boolean };

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
};

const initial = loadSave();
// Reviewer shortcut: ?unlock=all opens every vehicle without grinding coins.
if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('unlock') === 'all') initial.unlocked = ['brt'];

export type State = Saved & {
  screen: Screen;
  track: string;
  raceId: number;
  paused: boolean;
  hud: Hud;
  results: Result[] | null;
  coinsEarned: number;
  showAccountPrompt: boolean;
  setScreen: (s: Screen) => void;
  setVehicle: (v: VehicleId) => void;
  setPaint: (v: VehicleId, paint: string) => void;
  setDriver: (d: DriverId) => void;
  /** One more pickup has shown its how-to hint. */
  countItemHint: () => void;
  unlock: (v: VehicleId) => void;
  setSetting: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  startRace: () => void;
  quitRace: () => void;
  setPaused: (p: boolean) => void;
  setHud: (h: Partial<Hud>) => void;
  flash: (message: string) => void;
  finishRace: (results: Result[], coins: number, bestLap: number | null) => void;
  dismissAccountPrompt: () => void;
};

const emptyHud = (): Hud => ({
  phase: 'loading', countdown: '', lap: 1, laps: 3, position: 1, racers: 1, time: 0, lapTime: 0, bestLap: null,
  speed: 0, item: null, message: '', messageKey: 0, wrongWay: false,
  special: { name: '', charge: 0, ready: false },
});

export const useGame = create<State>((set, get) => ({
  ...initial,
  screen: 'menu',
  track: 'ojuelegba',
  raceId: 0,
  paused: false,
  hud: emptyHud(),
  results: null,
  coinsEarned: 0,
  showAccountPrompt: false,
  setScreen: screen => set({ screen }),
  setVehicle: vehicle => { set({ vehicle }); save(); },
  setPaint: (v, paint) => { set(s => ({ paint: { ...s.paint, [v]: paint } })); save(); },
  setDriver: driver => { set({ driver }); save(); },
  countItemHint: () => { set(s => ({ itemHints: s.itemHints + 1 })); save(); },
  unlock: v => {
    const s = get(), price = VEHICLES.find(x => x.id === v)?.locked?.coins ?? 0;
    if (s.unlocked.includes(v) || s.coins < price) return;
    set({ coins: s.coins - price, unlocked: [...s.unlocked, v], vehicle: v });
    save();
  },
  setSetting: (k, v) => { set({ settings: { ...get().settings, [k]: v } }); save(); },
  startRace: () => set(s => ({ screen: 'race', raceId: s.raceId + 1, paused: false, results: null, hud: emptyHud(), coinsEarned: 0, showAccountPrompt: false })),
  quitRace: () => set({ screen: 'menu', paused: false, results: null }),
  setPaused: paused => set({ paused }),
  setHud: h => set(s => ({ hud: { ...s.hud, ...h } })),
  flash: message => set(s => ({ hud: { ...s.hud, message, messageKey: s.hud.messageKey + 1 } })),
  finishRace: (results, coins, bestLap) => {
    const s = get();
    const best = { ...s.best };
    if (bestLap !== null && (best[s.track] === undefined || bestLap < best[s.track])) best[s.track] = bestLap;
    const races = s.races + 1;
    // Let people play straight away; after their second race, suggest an account to keep coins.
    const showAccountPrompt = races >= 2 && !s.accountPromptDismissed;
    set({ results, coins: s.coins + coins, coinsEarned: coins, best, races, showAccountPrompt });
    save();
  },
  dismissAccountPrompt: () => { set({ accountPromptDismissed: true, showAccountPrompt: false }); save(); },
}));

function save() {
  const s = useGame.getState();
  writeSave({
    settings: s.settings, coins: s.coins, best: s.best, races: s.races, vehicle: s.vehicle, unlocked: s.unlocked,
    accountPromptDismissed: s.accountPromptDismissed, paint: s.paint, itemHints: s.itemHints, driver: s.driver,
  });
}
