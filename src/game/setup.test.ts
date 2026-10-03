import { describe, expect, it } from 'vitest';
import type { GridEntry } from '../net/protocol';
import { makeRace, type OnlineSetup } from './setup';

const grid: GridEntry[] = [
  { netId: 0, slot: 1, name: 'Tunde', vehicle: 'danfo', ai: false },
  { netId: 1, slot: 2, name: 'Bisi', vehicle: 'keke', ai: false },
  { netId: 2, slot: 1, name: 'Area Fada', vehicle: 'brt-blue', ai: true },
  { netId: 3, slot: 2, name: 'Oga Landlord', vehicle: 'okada-blue', ai: true },
];
const online = (mySlot: number, seed = 1234): OnlineSetup => ({ grid, mySlot, seed });

describe('makeRace', () => {
  it('offline makeRace is unchanged: 6 racers, the player last and local, the rest ai', () => {
    const { race, spawns } = makeRace('ojuelegba', 'keke');
    expect(race.racers).toHaveLength(6);
    expect(spawns).toHaveLength(6);
    const player = race.racers[5];
    expect(player).toMatchObject({ id: 5, name: 'You', isPlayer: true, kind: 'local', owner: 0, remote: null, ai: null });
    expect(player.vehicle.id).toBe('keke');
    for (const r of race.racers.slice(0, 5)) {
      expect(r).toMatchObject({ isPlayer: false, kind: 'ai', owner: 0, remote: null });
      expect(r.ai).not.toBeNull();
    }
    expect(race.racers.map(r => r.id)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(race.nextId).toBe(1000);
    expect(race.net).toBeNull();
  });

  it('online: my entry is local, other humans remote, owners set from grid slots', () => {
    const { race, spawns } = makeRace('ojuelegba', 'okada', online(2));
    expect(race.racers).toHaveLength(4);
    expect(spawns).toHaveLength(4);
    expect(race.racers.map(r => [r.id, r.kind, r.owner, r.isPlayer, r.name, r.vehicle.id])).toEqual([
      [0, 'remote', 1, false, 'Tunde', 'danfo'],
      [1, 'local', 2, true, 'Bisi', 'keke'],
      [2, 'remote', 1, false, 'Area Fada', 'brt-blue'],
      [3, 'ai', 2, false, 'Oga Landlord', 'okada-blue'],
    ]);
    expect(race.racers[1].ai).toBeNull();
    expect(race.racers[3].ai).not.toBeNull();
    // Grid positions match the offline layout: netId 0 is the front of the left lane.
    const offline = makeRace('ojuelegba', 'okada').spawns;
    expect(spawns).toEqual(offline.slice(0, 4));
  });

  it('online: hazard ids start at mySlot × 100000', () => {
    expect(makeRace('ojuelegba', 'okada', online(1)).race.nextId).toBe(100000);
    expect(makeRace('ojuelegba', 'okada', online(3)).race.nextId).toBe(300000);
  });

  it('online: the same seed gives identical critters and AI skills on two calls', () => {
    const a = makeRace('ojuelegba', 'okada', online(1, 99)).race;
    const b = makeRace('ojuelegba', 'okada', online(2, 99)).race;
    const c = makeRace('ojuelegba', 'okada', online(1, 100)).race;
    expect(a.critters.length).toBeGreaterThan(0);
    expect(b.critters).toEqual(a.critters);
    expect(c.critters).not.toEqual(a.critters);
    // Every phone rolls the same skills, whoever ends up driving each AI car.
    const skills = (race: typeof a) => race.racers.map(r => r.ai?.skill ?? null);
    expect(skills(a)).toEqual(skills(b));
    expect(skills(a).slice(2).every(s => s !== null && s >= 0.9)).toBe(true);
    expect(skills(c)).not.toEqual(skills(a));
  });
});
