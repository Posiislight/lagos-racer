import { create } from 'zustand';
import { VEHICLES, type VehicleId } from '../config/vehicles';
import type { ItemKind } from './runtime';

export type Quality = 'low' | 'medium' | 'high';
export type Screen = 'menu' | 'garage' | 'online' | 'lobby' | 'race';

export type Settings = { quality: Quality; sound: boolean; steering: 'buttons' | 'tilt'; invertTilt: boolean; showFps: boolean };

/** time is the finish time, or a projection from average speed (projected: true) for racers still on track. */
export type Result = { name: string; vehicle: VehicleId; time: number | null; projected: boolean; best: number | null; isPlayer: boolean };

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
};

type Saved = { settings: Settings; coins: number; best: Record<string, number>; races: number; vehicle: VehicleId; unlocked: VehicleId[]; accountPromptDismissed: boolean };

const SAVE_KEY = 'lagos-racer:v1';

function detectQuality(): Quality {
  if (typeof navigator === 'undefined') return 'medium';
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
  const cores = navigator.hardwareConcurrency || 4;
  if (mobile && cores <= 6) return 'low';
  return mobile ? 'medium' : 'high';
}

function load(): Saved {
  const fallback: Saved = {
    settings: { quality: detectQuality(), sound: true, steering: 'buttons', invertTilt: false, showFps: false },
    coins: 0, best: {}, races: 0, vehicle: 'okada', unlocked: [], accountPromptDismissed: false,
  };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return fallback;
    const s = JSON.parse(raw) as Partial<Saved>;
    return { ...fallback, ...s, settings: { ...fallback.settings, ...s.settings } };
  } catch {
    return fallback;
  }
}

const initial = load();
// Reviewer shortcut: ?unlock=all opens every vehicle without grinding coins.
if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('unlock') === 'all') initial.unlocked = ['brt-blue', 'brt-red'];

export type State = Saved & {
  screen: Screen;
  track: string;
  raceId: number;
  /** True while the race is a room race (Race with friends). */
  online: boolean;
  paused: boolean;
  hud: Hud;
  results: Result[] | null;
  coinsEarned: number;
  showAccountPrompt: boolean;
  setScreen: (s: Screen) => void;
  setVehicle: (v: VehicleId) => void;
  unlock: (v: VehicleId) => void;
  setSetting: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  startRace: () => void;
  startOnlineRace: () => void;
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
});

export const useGame = create<State>((set, get) => ({
  ...initial,
  screen: 'menu',
  track: 'ojuelegba',
  raceId: 0,
  online: false,
  paused: false,
  hud: emptyHud(),
  results: null,
  coinsEarned: 0,
  showAccountPrompt: false,
  setScreen: screen => set({ screen }),
  setVehicle: vehicle => { set({ vehicle }); save(); },
  unlock: v => {
    const s = get(), price = VEHICLES.find(x => x.id === v)?.locked?.coins ?? 0;
    if (s.unlocked.includes(v) || s.coins < price) return;
    set({ coins: s.coins - price, unlocked: [...s.unlocked, v], vehicle: v });
    save();
  },
  setSetting: (k, v) => { set({ settings: { ...get().settings, [k]: v } }); save(); },
  startRace: () => set(s => ({ screen: 'race', online: false, raceId: s.raceId + 1, paused: false, results: null, hud: emptyHud(), coinsEarned: 0, showAccountPrompt: false })),
  startOnlineRace: () => set(s => ({ screen: 'race', online: true, raceId: s.raceId + 1, paused: false, results: null, hud: emptyHud(), coinsEarned: 0, showAccountPrompt: false })),
  quitRace: () => set({ screen: 'menu', online: false, paused: false, results: null }),
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
  const data: Saved = { settings: s.settings, coins: s.coins, best: s.best, races: s.races, vehicle: s.vehicle, unlocked: s.unlocked, accountPromptDismissed: s.accountPromptDismissed };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* private mode: progress just isn't kept */ }
}
