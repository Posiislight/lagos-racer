import type { ModeSpec } from '../config/campaign';
import { standings, type RacerProgress } from './race';

/**
 * Race modes as small stateful modules: when a race ends, who is ranked where, and (for
 * elimination) who is knocked out and when. They only read the structural `ModeView`, which the
 * race runtime satisfies, so they are tested without any physics.
 */
export type ModeRacer = {
  id: number;
  isPlayer: boolean;
  progress: Pick<RacerProgress, 'distance' | 'finishTime'>;
  /** Race clock time this racer was knocked out, or null while still in. */
  outAt: number | null;
};

export type ModeView = { clock: number; phase: 'countdown' | 'racing' | 'finished'; racers: ModeRacer[] };

/** `round` is 1-based: the number of eliminations so far, this one included. */
export type ModeEvent = { kind: 'eliminated'; racerId: number; round: number };

export type Mode = {
  id: 'laps' | 'elimination' | 'duel';
  /** Advance the mode by `dt` race seconds; may knock racers out (setting their `outAt`). */
  tick(view: ModeView, dt: number): ModeEvent[];
  over(view: ModeView): boolean;
  /** Racer ids, best first. */
  ranking(view: ModeView): number[];
  /** What the HUD shows for this mode, or null when it shows nothing extra. */
  hud(view: ModeView): { left: number; total: number; timer: number; round: number } | null;
};

/** Seconds a racer who has finished waits for the others before the results show. */
const FINISH_WAIT = 6;

export const isIn = (r: { outAt: number | null }) => r.outAt === null;

/** Seconds between knock-outs: `first`, shrinking by `step` each round, never under `floor`. `round` counts from 0. */
export function eliminationInterval(m: { first: number; step: number; floor: number }, round: number): number {
  return Math.max(m.floor, m.first - m.step * round);
}

const ranksByStandings = (view: ModeView) => standings(view.racers).map(r => r.id);

/** Over when everyone is home, or `FINISH_WAIT` s after `anchor` (the finish time that starts the wait). */
const allHomeOrWaited = (view: ModeView, anchor: number | null) =>
  anchor !== null && (view.racers.every(r => r.progress.finishTime !== null) || view.clock > anchor + FINISH_WAIT);

const lapsMode = (): Mode => ({
  id: 'laps',
  tick: () => [],
  over: view => allHomeOrWaited(view, view.racers.find(r => r.isPlayer)?.progress.finishTime ?? null),
  ranking: ranksByStandings,
  hud: () => null,
});

const duelMode = (): Mode => ({
  id: 'duel',
  tick: () => [],
  over: view => {
    const times = view.racers.map(r => r.progress.finishTime).filter((t): t is number => t !== null);
    return allHomeOrWaited(view, times.length ? Math.min(...times) : null);
  },
  ranking: ranksByStandings,
  hud: () => null,
});

function eliminationMode(spec: Extract<ModeSpec, { kind: 'elimination' }>): Mode {
  let round = 0;
  let timer = eliminationInterval(spec, 0);
  const over = (view: ModeView) => view.racers.filter(isIn).length <= 1 || view.racers.some(r => r.isPlayer && !isIn(r));
  return {
    id: 'elimination',
    tick(view, dt) {
      if (view.phase !== 'racing' || over(view)) return [];
      timer -= dt;
      if (timer > 0) return [];
      // The lowest distance is out; on a tie the lower id goes.
      const victim = view.racers.filter(isIn).reduce((a, b) => (b.progress.distance < a.progress.distance ? b : a));
      victim.outAt = view.clock;
      round += 1;
      timer = eliminationInterval(spec, round);
      return [{ kind: 'eliminated', racerId: victim.id, round }];
    },
    over,
    ranking(view) {
      const byId = (a: ModeRacer, b: ModeRacer) => a.id - b.id;
      const inRace = view.racers.filter(isIn).sort((a, b) => b.progress.distance - a.progress.distance || byId(a, b));
      const out = view.racers.filter(r => !isIn(r)).sort((a, b) => b.outAt! - a.outAt! || byId(a, b));
      return [...inRace, ...out].map(r => r.id);
    },
    hud: view => ({ left: view.racers.filter(isIn).length, total: view.racers.length, timer, round }),
  };
}

/** A fresh mode instance for one race (elimination keeps its timer and round inside it). */
export function createMode(spec: ModeSpec): Mode {
  switch (spec.kind) {
    case 'laps': return lapsMode();
    case 'duel': return duelMode();
    case 'elimination': return eliminationMode(spec);
  }
}
