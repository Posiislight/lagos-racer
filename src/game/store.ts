import { create } from 'zustand';
import { VEHICLES, type VehicleId } from '../config/vehicles';
import { driverAvailable, settle } from './campaign';
import { CHAPTER_1, type RaceSpec } from '../config/campaign';
import { roomPayout, upgradePrice, type Stars } from '../config/economy';
import type { DriverId } from '../config/drivers';
import type { ItemKind } from './runtime';
import { loadSave, roomEarnedToday, todayKey, writeSave, type Saved, type Settings } from './save';
import { levelsFor, type UpgradeKind } from './upgrades';

export type { Quality, Settings } from './save';
export type Screen = 'menu' | 'garage' | 'campaign' | 'online' | 'lobby' | 'race';

/**
 * time is the finish time, or a projection from average speed (projected: true) for racers still on track.
 * color: their paint. out: race clock seconds when knocked out (elimination), else null.
 * dnf is only set in a room race, for a car the referee threw out or that dropped.
 */
export type Result = { name: string; vehicle: VehicleId; color: string; time: number | null; projected: boolean; best: number | null; isPlayer: boolean; out: number | null; dnf?: boolean };

/** What a finished campaign race meant for the player (null for a room race). */
export type Outcome = { place: number; stars: Stars; newBest: boolean; passed: boolean; firstClear: boolean; unlocked: DriverId | null };

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
if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('unlock') === 'all') {
  initial.campaign = { cleared: CHAPTER_1.map(s => s.id), stars: Object.fromEntries(CHAPTER_1.map(s => [s.id, 3 as Stars])) };
}

export type State = Saved & {
  screen: Screen;
  raceId: number;
  /** The campaign race being run (null for a room race). */
  spec: RaceSpec | null;
  /** How the last race went, for the results card (null for a room race). */
  outcome: Outcome | null;
  /** True while the race is a room race (Race with friends). */
  online: boolean;
  paused: boolean;
  hud: Hud;
  results: Result[] | null;
  /** Naira paid by the last race. */
  coinsEarned: number;
  /** Stars won by the last campaign race (0 for a room race). */
  earnedStars: Stars;
  /** True when the last room race hit the daily cap. */
  roomCapped: boolean;
  showAccountPrompt: boolean;
  setScreen: (s: Screen) => void;
  setTrack: (id: string) => void;
  setVehicle: (v: VehicleId) => void;
  setPaint: (v: VehicleId, paint: string) => void;
  setDriver: (d: DriverId) => void;
  /** One more pickup has shown its how-to hint. */
  countItemHint: () => void;
  unlock: (v: VehicleId) => void;
  /** Buy the next level of one upgrade. True if it was bought. */
  buyUpgrade: (v: VehicleId, kind: UpgradeKind) => boolean;
  setSetting: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  /** Start a campaign race. */
  startRace: (spec: RaceSpec) => void;
  startOnlineRace: () => void;
  quitRace: () => void;
  setPaused: (p: boolean) => void;
  setHud: (h: Partial<Hud>) => void;
  flash: (message: string) => void;
  /** `place` is the player's 1-based finishing place. */
  /** `room` is set for a room race: it pays half, capped per day, and its best lap is on the room's track. */
  finishRace: (results: Result[], place: number, bestLap: number | null, room?: { trackId: string; dnf: boolean }) => void;
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
  earnedStars: 0,
  roomCapped: false,
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
  buyUpgrade: (v, kind) => {
    const s = get(), config = VEHICLES.find(x => x.id === v);
    if (!config || (config.locked && !s.unlocked.includes(v))) return false;
    const levels = levelsFor(s.upgrades, v), price = upgradePrice(levels[kind]);
    if (price === null || s.coins < price) return false;
    set({ coins: s.coins - price, upgrades: { ...s.upgrades, [v]: { ...levels, [kind]: levels[kind] + 1 } } });
    save();
    return true;
  },
  setSetting: (k, v) => { set({ settings: { ...get().settings, [k]: v } }); save(); },
  startRace: spec => set(s => ({ screen: 'race', online: false, spec, outcome: null, raceId: s.raceId + 1, paused: false, results: null, hud: emptyHud(), coinsEarned: 0, earnedStars: 0, roomCapped: false, showAccountPrompt: false })),
  // Room races are always on the server's track (see ONLINE_TRACK); the solo track pick is left alone.
  startOnlineRace: () => set(s => ({ screen: 'race', online: true, spec: null, outcome: null, raceId: s.raceId + 1, paused: false, results: null, hud: emptyHud(), coinsEarned: 0, earnedStars: 0, roomCapped: false, showAccountPrompt: false })),
  quitRace: () => set({ screen: 'menu', online: false, paused: false, results: null }),
  setPaused: paused => set({ paused }),
  setHud: h => set(s => ({ hud: { ...s.hud, ...h } })),
  flash: message => set(s => ({ hud: { ...s.hud, message, messageKey: s.hud.messageKey + 1 } })),
  finishRace: (results, place, bestLap, room) => {
    const s = get();
    // The best lap belongs to the track the race was run on, which a campaign race picks for itself.
    const trackId = room?.trackId ?? s.spec?.track ?? s.track;
    const best = { ...s.best };
    if (bestLap !== null && (best[trackId] === undefined || bestLap < best[trackId])) best[trackId] = bestLap;
    const races = s.races + 1;
    // Let people play straight away; after their second race, suggest an account to keep coins.
    const showAccountPrompt = races >= 2 && !s.accountPromptDismissed;
    const base = { results, best, races, showAccountPrompt };
    if (room) {
      const paid = roomPayout(place, room.dnf, roomEarnedToday(s));
      const today = todayKey();
      const roomEarned = { day: today, naira: (s.roomEarned.day === today ? s.roomEarned.naira : 0) + paid.naira };
      set({ ...base, coins: s.coins + paid.naira, coinsEarned: paid.naira, earnedStars: 0, roomCapped: paid.capped, outcome: null, roomEarned });
    } else if (s.spec) {
      const settled = settle(s.spec, place, s.campaign);
      const outcome = { place, stars: settled.stars, newBest: settled.newBest, passed: settled.passed, firstClear: settled.firstClear, unlocked: settled.unlocked };
      set({ ...base, coins: s.coins + settled.payout, coinsEarned: settled.payout, earnedStars: settled.stars, roomCapped: false, outcome, campaign: settled.saved });
    } else {
      set(base);
    }
    save();
  },
  dismissAccountPrompt: () => { set({ accountPromptDismissed: true, showAccountPrompt: false }); save(); },
}));

function save() {
  const s = useGame.getState();
  writeSave({
    settings: s.settings, coins: s.coins, best: s.best, races: s.races, vehicle: s.vehicle, unlocked: s.unlocked, upgrades: s.upgrades,
    accountPromptDismissed: s.accountPromptDismissed, paint: s.paint, itemHints: s.itemHints, driver: s.driver, track: s.track,
    campaign: s.campaign, roomEarned: s.roomEarned,
  });
}
