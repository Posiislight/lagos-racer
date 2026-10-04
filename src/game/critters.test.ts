import { describe, expect, it } from 'vitest';
import { updateCritters, type Critter } from './critters';
import { sampleAt } from './track';
import { racerAt, raceWith, track } from './testkit';
import { createProgress } from './race';
import { makeRacer, type RaceRuntime, type Racer } from './runtime';
import type { TrackConfig } from '../config/tracks';
import { vehicleById } from '../config/vehicles';
import { SnapshotBuffer } from '../net/interpolation';

/** A goat waiting at the roadside, `lat` metres right of the centre line 40 m round. */
function goat(lat: number): Critter {
  return { id: 1, kind: 'goat', s: 40, along: 0, lat, target: -lat, speed: 1, state: 'wait', timer: 100, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, spin: 0, phase: 0 };
}

/** A racer standing exactly where the goat is. */
function racerOnGoat(c: Critter, outAt: number | null) {
  const r = racerAt(1, 40, true);
  const race = raceWith([r]);
  race.critters.push(c);
  const at = sampleAt(track, 40);
  const pos = { x: at.pos.x + at.right.x * c.lat, y: at.pos.y, z: at.pos.z + at.right.z * c.lat };
  r.body!.translation = () => pos;
  r.outAt = outAt;
  return { r, race };
}

describe('critters and racers', () => {
  it('a racer still in knocks a goat flying', () => {
    const { race } = racerOnGoat(goat(8), null);
    updateCritters(race, 0.016);
    expect(race.critters[0].state).toBe('fly');
  });

  it('a racer who is out does not hit a goat', () => {
    const { r, race } = racerOnGoat(goat(8), 5);
    updateCritters(race, 0.016);
    expect(race.critters[0].state).toBe('wait');
    expect(r.wobble).toBe(0);
  });
});

const config = { id: 'test', halfWidth: 6.5, laps: 3, items: [], bridges: [], zones: [] } as unknown as TrackConfig;

/** A goat standing in the middle of the road 20 m on, waiting a long while. */
const midGoat = (): Critter => ({
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

describe('critters and remote cars', () => {
  it('a DNF car parked below the road does not knock a goat flying', () => {
    const c = midGoat();
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
