import { describe, expect, it } from 'vitest';
import { buildTrack } from './track';
import { createProgress } from './race';
import { makeRacer, type RaceRuntime, type Racer } from './runtime';
import { updateCritters, type Critter } from './critters';
import type { TrackConfig } from '../config/tracks';
import { vehicleById } from '../config/vehicles';
import { SnapshotBuffer } from '../net/interpolation';

const control: [number, number][] = [[0, 0], [50, 0], [70, 15], [70, 45], [50, 60], [-50, 60], [-70, 45], [-70, 15], [-50, 0]];
const track = buildTrack(control, 1);
const config = { id: 'test', control, halfWidth: 6.5, laps: 3, items: [], bridges: [], zones: [] } as unknown as TrackConfig;

/** A goat standing in the middle of the road 20 m on, waiting a long while. */
const goat = (): Critter => ({
  id: 1, kind: 'goat', s: 20, along: 0, lat: 0, target: 0, speed: 1, state: 'wait', timer: 100,
  x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, spin: 0, phase: 0,
});

/** Another phone's car facing +x at this spot. */
function remoteAt(x: number, y: number, z: number, dnf: boolean): Racer {
  const r = makeRacer(1, 'r1', vehicleById('okada'), vehicleById('okada').paints[0], false, createProgress(track, x, z));
  r.kind = 'remote';
  r.remote = { buffer: new SnapshotBuffer(), dnf };
  r.body = {
    translation: () => ({ x, y, z }),
    rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }),
    linvel: () => ({ x: 0, y: 0, z: 0 }),
  } as unknown as Racer['body'];
  return r;
}

describe('critters', () => {
  it('a DNF car parked below the road does not knock a goat flying', () => {
    const c = goat();
    const race = { config, track, racers: [], critters: [c] } as unknown as RaceRuntime;
    updateCritters(race, 1 / 60);
    race.racers = [remoteAt(c.x, -200, c.z, true)];
    updateCritters(race, 1 / 60);
    expect(c.state).toBe('wait');

    // The same spot on the road with a car still racing does.
    race.racers = [remoteAt(c.x, 0.5, c.z, false)];
    updateCritters(race, 1 / 60);
    expect(c.state).toBe('fly');
  });
});
