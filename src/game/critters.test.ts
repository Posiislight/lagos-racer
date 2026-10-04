import { describe, expect, it } from 'vitest';
import { updateCritters, type Critter } from './critters';
import { sampleAt } from './track';
import { racerAt, raceWith, track } from './testkit';

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
