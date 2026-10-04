import { describe, expect, it } from 'vitest';
import { CHAPTER_1, type RaceSpec } from '../config/campaign';
import { VEHICLES } from '../config/vehicles';
import { makeRace } from './setup';

const okada = { vehicle: 'okada' as const, paint: VEHICLES.find(v => v.id === 'okada')!.paints[0].id };
const laps = { track: 'ojuelegba', mode: { kind: 'laps', laps: 3 } } as const;
const elimination = { track: 'ojuelegba', mode: { kind: 'elimination', first: 20, step: 2, floor: 10 } } as const;

describe('makeRace: laps', () => {
  const { race, spawns } = makeRace(laps, okada, 'moshood');

  it('puts six racers on the grid with the player last', () => {
    expect(race.racers).toHaveLength(6);
    expect(race.racers.filter(r => r.isPlayer)).toHaveLength(1);
    const player = race.racers[5];
    expect(player.isPlayer).toBe(true);
    expect(player.id).toBe(5);
    expect(player.driver).toBe('moshood');
    expect(spawns).toHaveLength(6);
  });

  it('sets up the mode, laps and spec', () => {
    expect(race.config.laps).toBe(3);
    expect(race.mode.id).toBe('laps');
    expect(race.spec).toBeNull();
    expect(race.racers.every(r => r.outAt === null)).toBe(true);
  });

  it('uses the track it is given', () => {
    expect(makeRace({ ...laps, track: 'ikorodu' }, okada, 'moshood').race.config.id).toBe('ikorodu');
  });

  it('gives each call its own mode and racers', () => {
    const other = makeRace(laps, okada, 'moshood').race;
    expect(other.mode).not.toBe(race.mode);
    expect(other.racers).not.toBe(race.racers);
  });

  it('stores a spec when one is passed', () => {
    expect(makeRace(CHAPTER_1[0], okada, 'moshood', CHAPTER_1[0]).race.spec).toBe(CHAPTER_1[0]);
  });

  it('keeps the AI from using driver specials (only the duel does)', () => {
    for (const r of race.racers.filter(x => !x.isPlayer)) expect(r.ai!.special).toBe(false);
  });
});

describe('makeRace: elimination', () => {
  const { race } = makeRace(elimination, okada, 'moshood');
  it('has no lap limit', () => {
    expect(race.config.laps).toBe(Infinity);
    expect(race.mode.id).toBe('elimination');
    expect(race.racers).toHaveLength(6);
    for (const r of race.racers.filter(x => !x.isPlayer)) expect(r.ai!.special).toBe(false);
  });
});

describe('makeRace: excluded drivers', () => {
  it('never gives a rival an excluded driver', () => {
    for (let i = 0; i < 50; i++) {
      const { race } = makeRace({ ...laps, excludeDrivers: ['mamaput'] }, okada, 'moshood');
      expect(race.racers.filter(r => !r.isPlayer).some(r => r.driver === 'mamaput')).toBe(false);
    }
  });
});

describe('makeRace: shape of a spec', () => {
  it('accepts every chapter 1 race that is not a duel', () => {
    for (const spec of CHAPTER_1.filter((s: RaceSpec) => s.mode.kind !== 'duel')) {
      expect(makeRace(spec, okada, 'moshood', spec).race.racers).toHaveLength(6);
    }
  });
});

describe('makeRace: duel', () => {
  const duel = { track: 'ikorodu', mode: { kind: 'duel', laps: 2, skill: 1.06 } } as const;

  for (const vehicle of ['okada', 'brt'] as const) {
    it(`puts Mama Put beside the player in a ${vehicle} of another paint`, () => {
      const mine = { vehicle, paint: VEHICLES.find(v => v.id === vehicle)!.paints[0].id };
      const { race, spawns } = makeRace(duel, mine, 'moshood');
      expect(race.racers).toHaveLength(2);
      expect(spawns).toHaveLength(2);
      const [her, me] = race.racers;
      expect(me).toMatchObject({ id: 1, isPlayer: true, driver: 'moshood' });
      expect(her).toMatchObject({ id: 0, isPlayer: false, name: 'Mama Put', driver: 'mamaput' });
      expect(her.vehicle.id).toBe(vehicle);
      expect(her.paint.id).not.toBe(mine.paint);
      expect(her.ai!.skill).toBe(1.06);
      expect(her.ai!.special).toBe(true);
      expect(Math.abs(her.progress.distance - me.progress.distance)).toBeLessThan(0.5);
      expect(me.progress.lateral).toBeGreaterThan(0);
      expect(her.progress.lateral).toBeLessThan(0);
    });
  }

  it('is a two-lap race with items on', () => {
    const { race } = makeRace(duel, okada, 'moshood');
    expect(race.config.laps).toBe(2);
    expect(race.config.id).toBe('ikorodu');
    expect(race.mode.id).toBe('duel');
    expect(race.pickups.length).toBeGreaterThan(0);
  });
});
