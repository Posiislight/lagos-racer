import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOT_SKILL, aiSpecial, botAI, catchUpGap, humanize, sideStep, type Footprint } from './ai';
import { aiState, type RaceRuntime } from './runtime';
import { racerAt, raceWith, track } from './testkit';
import { seededRandom } from './random';

const HW = 6.5;
const car = (o: Partial<Footprint>): Footprint => ({ lateral: 0, distance: 100, halfLength: 2.2, halfWidth: 0.9, ...o });

describe('sideStep', () => {
  it('moves away from a vehicle right alongside, far enough to clear it', () => {
    const lane = sideStep(car({}), [car({ lateral: 1, distance: 101 })], HW);
    expect(lane).not.toBeNull();
    expect(lane!).toBeLessThanOrEqual(1 - (0.9 + 0.9 + 1));
  });

  it('ignores vehicles well ahead or behind', () => {
    expect(sideStep(car({}), [car({ lateral: 1, distance: 120 })], HW)).toBeNull();
    expect(sideStep(car({}), [car({ lateral: 1, distance: 80 })], HW)).toBeNull();
  });

  it('ignores vehicles alongside that are already clear', () => {
    expect(sideStep(car({}), [car({ lateral: 4, distance: 100 })], HW)).toBeNull();
  });

  it('counts a long bus as alongside along its whole length', () => {
    const bus = car({ lateral: 1.5, distance: 105, halfLength: 4.1, halfWidth: 0.9 });
    expect(sideStep(car({}), [bus], HW)).not.toBeNull();
  });

  it('goes round the other side when the kerb is in the way', () => {
    const lane = sideStep(car({ lateral: -3.5 }), [car({ lateral: -2, distance: 100.5 })], HW);
    expect(lane).toBeCloseTo(-2 + 2.8, 5);
  });
});

describe('aiSpecial', () => {
  const none = () => 0;
  /** An AI driver of the given kind standing `s` metres round with a full meter. */
  const driver = (id: number, s: number, kind: 'moshood' | 'mamaput') => {
    const r = racerAt(id, s);
    r.driver = kind; r.charge = 1; r.ai = aiState(0, 1, 2, 0, true);
    return r;
  };

  it('never fires unless the race allows AI specials (only the duel does)', () => {
    for (const kind of ['moshood', 'mamaput'] as const) {
      const r = driver(1, 5, kind), race = raceWith([r, racerAt(2, -20)]);
      r.ai = aiState(0, 1);
      expect(r.ai.special).toBe(false);
      for (let i = 0; i < 40; i++) expect(aiSpecial(r, race, 0.5, none)).toBe(false);
    }
  });

  it('never fires with a part-charged meter', () => {
    const r = driver(1, 5, 'moshood'), race = raceWith([r]);
    r.charge = 0.5;
    for (let i = 0; i < 40; i++) expect(aiSpecial(r, race, 0.5, none)).toBe(false);
  });

  it('Moshood fires on a straight after the short delay', () => {
    const r = driver(1, 5, 'moshood'), race = raceWith([r]);
    expect(aiSpecial(r, race, 0.3, none)).toBe(false);
    expect(aiSpecial(r, race, 0.3, none)).toBe(true);
  });

  it('Moshood holds fire in a bend until he has waited 10 s', () => {
    const r = driver(1, 60, 'moshood'), race = raceWith([r]);
    for (let i = 0; i < 18; i++) expect(aiSpecial(r, race, 0.5, none)).toBe(false); // 9 s
    expect(aiSpecial(r, race, 1.5, none)).toBe(true); // 10.5 s
  });

  it('Mama Put fires with a rival within 30 m behind', () => {
    const r = driver(1, 40, 'mamaput'), race = raceWith([r, racerAt(2, 20)]);
    expect(aiSpecial(r, race, 0.3, none)).toBe(false);
    expect(aiSpecial(r, race, 0.3, none)).toBe(true);
  });

  it('Mama Put waits with nobody behind, then fires after 10 s', () => {
    const r = driver(1, 40, 'mamaput'), race = raceWith([r, racerAt(2, 80)]);
    for (let i = 0; i < 18; i++) expect(aiSpecial(r, race, 0.5, none)).toBe(false);
    expect(aiSpecial(r, race, 1.5, none)).toBe(true);
  });

  it('restarts the delay for the next charge', () => {
    const r = driver(1, 5, 'moshood'), race = raceWith([r]);
    aiSpecial(r, race, 0.3, none);
    expect(r.ai!.specialDelay).toBeCloseTo(0.2, 5);
    r.charge = 0; // fired
    expect(aiSpecial(r, race, 0.1, none)).toBe(false);
    expect(r.ai!.specialDelay).toBe(-1);
    r.charge = 1;
    aiSpecial(r, race, 0.1, () => 1);
    expect(r.ai!.specialDelay).toBeCloseTo(2 - 0.1, 5);
  });
});

describe('catchUpGap', () => {
  const rival = racerAt(1, 60), me = racerAt(2, 5, true);
  const gap = (id: 'laps' | 'duel', r = rival, p = me) => catchUpGap({ mode: { id } } as unknown as Pick<RaceRuntime, 'mode'>, r, p);

  it('is how far a rival is ahead of the player in an ordinary race', () => {
    expect(gap('laps')).toBeCloseTo(rival.progress.distance - me.progress.distance, 5);
    expect(gap('laps')).toBeGreaterThan(40);
  });
  it('is zero in a duel, so the rival is never rubber-banded', () => {
    expect(gap('duel')).toBe(0);
  });
  it('is zero for the player', () => {
    expect(gap('laps', me, me)).toBe(0);
  });
});

describe('aiSpecial with a rival who is out', () => {
  const run = (rivalOut: boolean) => {
    const r = racerAt(1, 40);
    r.driver = 'mamaput'; r.charge = 1; r.ai = aiState(0, 1, 2, 0, true);
    const behind = racerAt(2, 20);
    if (rivalOut) behind.outAt = 5;
    const race = raceWith([r, behind]);
    aiSpecial(r, race, 0.3, () => 0);
    return aiSpecial(r, race, 0.3, () => 0);
  };
  it('does not count a knocked-out racer behind as a target', () => expect(run(true)).toBe(false));
  it('still fires at a racer behind who is in', () => expect(run(false)).toBe(true));
});

describe('humanize (Quick race bots drive like people)', () => {
  afterEach(() => vi.restoreAllMocks());
  const DT = 1 / 60, HW = 6;

  /** A bot in a Quick room, driving round the test loop at 20 m/s while the AI keeps its foot down. */
  function bot(seed: number) {
    vi.spyOn(Math, 'random').mockImplementation(seededRandom(seed));
    const r = racerAt(1, 0);
    r.ai = botAI(0);
    const race = raceWith([r]);
    race.humanize = true;
    race.clock = 0;
    /** One frame: what driveAI asked for, then the human layer on top. */
    const frame = (ask: Partial<typeof r.controls> = {}) => {
      Object.assign(r.controls, { throttle: 1, brake: 0, steer: 0.5, useItem: false, ...ask });
      humanize(r, DT, race);
      race.clock += DT;
      r.progress.s = (race.clock * 20) % track.length;
    };
    return { r, race, frame };
  }
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

  it('bots roll a skill in the bot range', () => {
    for (const seed of SEEDS) {
      vi.spyOn(Math, 'random').mockImplementation(seededRandom(seed));
      const s = botAI(1.5).skill;
      expect(s).toBeGreaterThanOrEqual(BOT_SKILL[0]);
      expect(s).toBeLessThanOrEqual(BOT_SKILL[1]);
    }
    expect(BOT_SKILL).toEqual([0.85, 1.0]);
  });

  it('humanize keeps start delay, wobble, mistake and hold within bounds', () => {
    const delays: number[] = [];
    let mistakes = 0;
    for (const seed of SEEDS) {
      const { r, race, frame } = bot(seed);
      // Slightly late off the line at the green light: 0 to 0.4 s with no throttle.
      let go: number | null = null;
      while (go === null && race.clock < 2) {
        const t = race.clock;
        frame();
        if (r.controls.throttle > 0) go = t;
      }
      expect(go).not.toBeNull();
      expect(go!).toBeGreaterThanOrEqual(0);
      expect(go!).toBeLessThanOrEqual(0.4 + 1e-9);
      delays.push(go!);

      // Five minutes of driving: gentle wobble, the odd short mistake, never two within 25 s. The worst of each is
      // collected and checked once (an expect per frame is slow).
      let lastStart = -Infinity, running = 0, wasOn = false;
      let widest = 0, shortestGap = Infinity, longest = 0, harmless = 0;
      while (race.clock < 300) {
        const t = race.clock;
        frame();
        widest = Math.max(widest, Math.abs(r.ai!.offset));
        const on = r.ai!.human!.mistake > 0;
        if (on && !wasOn) {
          shortestGap = Math.min(shortestGap, t - lastStart);
          lastStart = t; running = 0; mistakes++;
        }
        if (on) {
          running += DT;
          longest = Math.max(longest, running);
          // A mistake is a lift off the throttle or a wide line (less steering than the AI asked for).
          if (r.controls.throttle !== 0 && Math.abs(r.controls.steer) >= 0.5) harmless++;
        }
        wasOn = on;
      }
      expect(widest).toBeLessThanOrEqual(0.15 * HW + 1e-9);
      expect(shortestGap).toBeGreaterThanOrEqual(25);
      expect(longest).toBeLessThanOrEqual(0.6 + 1e-9);
      expect(harmless).toBe(0);
    }
    // The delays really vary, and mistakes really happen.
    expect(new Set(delays.map(d => d.toFixed(2))).size).toBeGreaterThan(3);
    expect(mistakes).toBeGreaterThan(SEEDS.length);
  });

  it('holds a power-up for 0.5 to 3 s before using it, even when the AI wants it at once', () => {
    const holds: number[] = [];
    for (const seed of SEEDS) {
      const { r, race, frame } = bot(seed);
      race.clock = 30;
      for (let k = 0; k < 6; k++) {
        r.item = 'juju';
        const got = race.clock;
        let used: number | null = null;
        while (used === null && race.clock < got + 5) {
          const t = race.clock;
          frame({ useItem: true });
          if (r.controls.useItem) used = t;
        }
        expect(used).not.toBeNull();
        const held = used! - got;
        expect(held).toBeGreaterThanOrEqual(0.5);
        expect(held).toBeLessThanOrEqual(3);
        holds.push(held);
        // items.ts takes the item once it is used.
        r.item = null;
        frame();
      }
    }
    expect(Math.max(...holds) - Math.min(...holds)).toBeGreaterThan(1);
  });

  it('leaves the controls alone outside Quick rooms', () => {
    const { r, race, frame } = bot(1);
    race.humanize = false;
    r.item = 'oil';
    for (let i = 0; i < 600; i++) {
      frame({ useItem: true });
      expect(r.controls).toMatchObject({ throttle: 1, steer: 0.5, useItem: true });
      expect(r.ai!.offset).toBe(0);
    }
  });
});
