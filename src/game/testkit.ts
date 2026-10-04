import { vi } from 'vitest';
import { buildTrack, sampleAt } from './track';
import { createProgress } from './race';
import { makeRacer, type RaceRuntime, type Racer } from './runtime';
import { VEHICLES } from '../config/vehicles';

/** Shared helpers for the race-logic tests: a small loop track, racers standing on it, and a race around them. */
const control: [number, number][] = [[0, 0], [50, 0], [70, 15], [70, 45], [50, 60], [-50, 60], [-70, 45], [-70, 15], [-50, 0]];
export const track = buildTrack(control, 1);

/** A racer standing on the centre line `s` metres round, heading +x, with a stand-in physics body. */
export function racerAt(id: number, s: number, isPlayer = false): Racer & { setLinvel: ReturnType<typeof vi.fn> } {
  const at = sampleAt(track, s).pos;
  const r = makeRacer(id, `R${id}`, VEHICLES[0], VEHICLES[0].paints[0], isPlayer, createProgress(track, at.x, at.z));
  const setLinvel = vi.fn();
  r.body = {
    translation: () => ({ x: at.x, y: at.y, z: at.z }),
    rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }),
    linvel: () => ({ x: 20, y: 0, z: 0 }),
    setLinvel,
  } as unknown as Racer['body'];
  return Object.assign(r, { setLinvel });
}

export function raceWith(racers: Racer[]): RaceRuntime {
  return {
    config: { items: [100, 200], halfWidth: 6 }, track, racers, hazards: [], pickups: [], clock: 0, countdown: 0,
    phase: 'racing', playerFinishedAt: null, nextId: 1, puffs: [], critters: [],
  } as unknown as RaceRuntime;
}
