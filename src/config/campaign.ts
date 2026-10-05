import type { DriverId } from './drivers';

/**
 * The single-player campaign: every race of Chapter 1 and the numbers behind it, in one place so
 * tuning is easy. The rules that use this live in `src/game/campaign.ts`.
 */
export type ModeSpec =
  | { kind: 'laps'; laps: number }
  /** Every `first` s the racer furthest behind is out; each round is `step` s shorter, never under `floor`. */
  | { kind: 'elimination'; first: number; step: number; floor: number }
  /** Two racers; Mama Put drives at `skill` (a multiplier on target speed) with no rubber band. */
  | { kind: 'duel'; laps: number; skill: number };

/** Everything `makeRace` needs: where, how, and which drivers are kept off the grid. */
export type RaceSetup = { track: string; mode: ModeSpec; excludeDrivers?: DriverId[] };

export type RaceSpec = RaceSetup & {
  id: string;
  title: string;
  story: string;
  rule: string;
  /** Finish this place or better to pass. */
  pass: { place: number };
  /** Stars by 1-based place (first place is entry 0); places beyond the table earn none. Missing means `DEFAULT_STARS`. */
  stars?: number[];
  /** Unlocked the first time this race is passed. */
  reward?: { driver: DriverId };
  /** Mama Put's lines: before the start, when she wins, when she loses. */
  taunts?: { before: string; win: string; lose: string };
};

export const CHAPTER_1: RaceSpec[] = [
  {
    id: 'campaign-1-1', title: 'Ojuelegba Hustle', track: 'ojuelegba', mode: { kind: 'laps', laps: 3 },
    excludeDrivers: ['mamaput'],
    story: 'Under the bridge, round the market. Finish top three to move on.', rule: 'Top 3 to move on',
    pass: { place: 3 },
  },
  {
    id: 'campaign-1-2', title: 'Third Mainland Dash', track: 'third-mainland', mode: { kind: 'laps', laps: 2 },
    excludeDrivers: ['mamaput'],
    story: 'Up the ramp, over the lagoon, home through the water village. Top three again.', rule: 'Top 3 to move on',
    pass: { place: 3 },
  },
  {
    id: 'campaign-1-3', title: 'LASTMA Is Coming', track: 'ojuelegba', mode: { kind: 'elimination', first: 20, step: 2, floor: 10 },
    excludeDrivers: ['mamaput'],
    story: 'Every 20 seconds LASTMA clamps whoever is last. Do not be last.', rule: 'Last place is clamped every 20 s',
    pass: { place: 3 },
  },
  {
    id: 'campaign-1-4', title: "Mama Put's Challenge", track: 'ikorodu', mode: { kind: 'duel', laps: 2, skill: 1.06 },
    story: 'Mama Put has heard you are fast. One road, one pot, no mercy. Beat her and she rides with you.', rule: 'Beat her to win',
    pass: { place: 1 }, stars: [3], reward: { driver: 'mamaput' },
    taunts: { before: 'Oga, you go pay for that jollof.', win: 'Shine your eye, small boy.', lose: 'Next time carry your own pot.' },
  },
];
