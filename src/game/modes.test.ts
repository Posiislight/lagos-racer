import { describe, expect, it } from 'vitest';
import { createMode, eliminationInterval, isIn, type ModeRacer, type ModeView } from './modes';
import { standings } from './race';

const racer = (id: number, distance: number, extra: { finishTime?: number | null; outAt?: number | null } = {}): ModeRacer => ({
  id, isPlayer: id === 0, progress: { distance, finishTime: extra.finishTime ?? null }, outAt: extra.outAt ?? null,
});
const view = (racers: ModeRacer[], clock = 0, phase: ModeView['phase'] = 'racing'): ModeView => ({ clock, phase, racers });
const ELIM = { kind: 'elimination', first: 20, step: 2, floor: 10 } as const;
const six = (distances: number[]) => distances.map((d, i) => racer(i, d));

describe('isIn', () => {
  it('is true only while outAt is null', () => {
    expect(isIn({ outAt: null })).toBe(true);
    expect(isIn({ outAt: 12 })).toBe(false);
    expect(isIn({ outAt: 0 })).toBe(false);
  });
});

describe('eliminationInterval', () => {
  it('shrinks by the step each round and stops at the floor', () => {
    expect([0, 1, 4, 5, 9].map(r => eliminationInterval(ELIM, r))).toEqual([20, 18, 12, 10, 10]);
  });
});

describe('createMode', () => {
  it('gives each kind its id', () => {
    expect(createMode({ kind: 'laps', laps: 3 }).id).toBe('laps');
    expect(createMode(ELIM).id).toBe('elimination');
    expect(createMode({ kind: 'duel', laps: 2, skill: 1.06 }).id).toBe('duel');
  });

  it('does not share an elimination timer between instances', () => {
    const a = createMode(ELIM), b = createMode(ELIM), v = view(six([5, 6, 7, 8, 9, 10]));
    expect(a.tick(v, 20.1)).toHaveLength(1);
    expect(b.tick(view(six([5, 6, 7, 8, 9, 10])), 19.9)).toEqual([]);
  });
});

describe('laps mode', () => {
  const mode = createMode({ kind: 'laps', laps: 3 });

  it('is over only once the player has finished and the rest are in or 6 s have passed', () => {
    expect(mode.over(view([racer(0, 100), racer(1, 100, { finishTime: 90 })], 200))).toBe(false);
    expect(mode.over(view([racer(0, 100, { finishTime: 100 }), racer(1, 100, { finishTime: 99 })], 101))).toBe(true);
    const late = (clock: number) => view([racer(0, 100, { finishTime: 100 }), racer(1, 90)], clock);
    expect(mode.over(late(105.9))).toBe(false);
    expect(mode.over(late(106.1))).toBe(true);
  });

  it('ranks like standings', () => {
    const racers = [racer(0, 400), racer(1, 500), racer(2, 900, { finishTime: 95 }), racer(3, 900, { finishTime: 90 })];
    expect(mode.ranking(view(racers))).toEqual(standings(racers).map(r => r.id));
    expect(mode.ranking(view(racers))).toEqual([3, 2, 1, 0]);
  });

  it('does nothing on tick and has no HUD', () => {
    const racers = six([1, 2, 3, 4, 5, 6]);
    expect(mode.tick(view(racers, 50), 100)).toEqual([]);
    expect(racers.every(r => r.outAt === null)).toBe(true);
    expect(mode.hud(view(racers))).toBeNull();
  });
});

describe('elimination mode', () => {
  it('eliminates the last racer when the timer runs out, then shows the next timer', () => {
    const mode = createMode(ELIM), racers = six([5, -3, 12, 40, 8, 20]), v = view(racers, 20);
    expect(mode.tick(v, 19.9)).toEqual([]);
    expect(mode.tick(v, 0.2)).toEqual([{ kind: 'eliminated', racerId: 1, round: 1 }]);
    expect(racers[1].outAt).toBe(20);
    const h = mode.hud(v)!;
    expect(h).toMatchObject({ left: 5, total: 6, round: 1 });
    expect(h.timer).toBeCloseTo(18, 0);
    v.clock = 38;
    const second = mode.tick(v, 18.1);
    expect(second).toEqual([{ kind: 'eliminated', racerId: 0, round: 2 }]);
    expect(mode.hud(v)!.timer).toBeCloseTo(16, 0);
  });

  it('picks the lowest distance, the lower id on a tie, and never someone already out', () => {
    const mode = createMode(ELIM), racers = six([9, 4, 4, 9, 9, 9]), v = view(racers);
    expect(mode.tick(v, 20.1)[0].racerId).toBe(1);
    v.clock = 40;
    expect(mode.tick(v, 18.1)[0].racerId).toBe(2);
  });

  it('only counts down while racing', () => {
    const mode = createMode(ELIM), racers = six([1, 2, 3, 4, 5, 6]);
    expect(mode.tick(view(racers, 0, 'countdown'), 100)).toEqual([]);
    expect(mode.tick(view(racers, 0, 'finished'), 100)).toEqual([]);
    expect(racers.every(r => r.outAt === null)).toBe(true);
  });

  it('eliminates at most one racer per tick and restarts the timer after a hitch', () => {
    const mode = createMode(ELIM), v = view(six([1, 2, 3, 4, 5, 6]));
    expect(mode.tick(v, 100)).toHaveLength(1);
    expect(mode.tick(v, 0.1)).toEqual([]);
  });

  it('is over with one racer left or when the player is out, and then stops eliminating', () => {
    const mode = createMode(ELIM);
    expect(mode.over(view(six([1, 2, 3, 4, 5, 6])))).toBe(false);
    const one = six([1, 2, 3, 4, 5, 6]);
    for (const r of one.slice(1)) r.outAt = 10;
    expect(mode.over(view(one))).toBe(true);
    expect(mode.tick(view(one), 100)).toEqual([]);
    const playerOut = six([1, 2, 3, 4, 5, 6]);
    playerOut[0].outAt = 30; playerOut[5].outAt = 10;
    expect(mode.over(view(playerOut))).toBe(true);
    expect(mode.tick(view(playerOut), 100)).toEqual([]);
    expect(playerOut.filter(r => r.outAt !== null)).toHaveLength(2);
  });

  it('ranks those still in by distance, then the knocked out latest-first', () => {
    const mode = createMode(ELIM);
    const early = [racer(0, 10, { outAt: 38 }), racer(1, 30), racer(2, 50), racer(3, 20), racer(4, 40), racer(5, 0, { outAt: 20 })];
    expect(mode.ranking(view(early))).toEqual([2, 4, 1, 3, 0, 5]);
    const done = [racer(0, 90), racer(1, 10, { outAt: 80 }), racer(2, 20, { outAt: 68 }), racer(3, 30, { outAt: 54 }), racer(4, 40, { outAt: 38 }), racer(5, 50, { outAt: 20 })];
    expect(mode.ranking(view(done))).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('duel mode', () => {
  const mode = createMode({ kind: 'duel', laps: 2, skill: 1.06 });

  it('is over when both are home or 6 s after the first finish', () => {
    expect(mode.over(view([racer(0, 10), racer(1, 20)], 5))).toBe(false);
    expect(mode.over(view([racer(0, 900, { finishTime: 80 }), racer(1, 900, { finishTime: 81 })], 81))).toBe(true);
    const one = (clock: number) => view([racer(0, 500), racer(1, 900, { finishTime: 80 })], clock);
    expect(mode.over(one(85.9))).toBe(false);
    expect(mode.over(one(86.1))).toBe(true);
  });

  it('ranks like standings and has no HUD', () => {
    const v = view([racer(0, 500), racer(1, 900, { finishTime: 80 })]);
    expect(mode.ranking(v)).toEqual([1, 0]);
    expect(mode.hud(v)).toBeNull();
  });
});
