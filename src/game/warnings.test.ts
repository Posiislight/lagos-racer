import { beforeEach, describe, expect, it, vi } from 'vitest';

const loop = vi.hoisted(() => ({ start: vi.fn(), set: vi.fn(), stop: vi.fn() }));
vi.mock('./audio', () => ({ Loop: class { start = loop.start; set = loop.set; stop = loop.stop; }, sfx: vi.fn(), duck: vi.fn() }));

import { racerAt, raceWith } from './testkit';
import { nearestJujuAtPlayer, resetWarnings, updateWarnings } from './warnings';
import type { Hazard } from './runtime';

const juju = (x: number, z: number, target: number | null, id = 50): Hazard =>
  ({ id, kind: 'juju', x, y: 1, z, vx: 0, vy: 0, vz: 0, owner: 2, target, life: 5, armed: 0, ground: 0 });

function setup() {
  const me = racerAt(1, 40, true), other = racerAt(2, 10), race = raceWith([me, other]);
  const at = me.body!.translation();
  return { me, race, at };
}

beforeEach(() => { resetWarnings(); loop.start.mockClear(); loop.set.mockClear(); loop.stop.mockClear(); });

describe('nearestJujuAtPlayer', () => {
  it('measures the distance to a juju aimed at the player', () => {
    const { race, at } = setup();
    race.hazards.push(juju(at.x + 20, at.z, 1));
    expect(nearestJujuAtPlayer(race)!.dist).toBeCloseTo(20, 3);
  });

  it('uses the nearest when two are aimed at the player', () => {
    const { race, at } = setup();
    race.hazards.push(juju(at.x + 50, at.z, 1, 51), juju(at.x + 20, at.z, 1, 52));
    expect(nearestJujuAtPlayer(race)!.dist).toBeCloseTo(20, 3);
  });

  it('ignores a juju aimed at someone else', () => {
    const { race, at } = setup();
    race.hazards.push(juju(at.x + 20, at.z, 2));
    expect(nearestJujuAtPlayer(race)).toBeNull();
  });

  it('reports a juju ahead as angle 0 and one on the left as positive', () => {
    const { race, at } = setup();
    race.hazards.push(juju(at.x + 20, at.z, 1));
    expect(nearestJujuAtPlayer(race)!.relAngle).toBeCloseTo(0, 5);
    race.hazards = [juju(at.x, at.z - 20, 1)];
    expect(nearestJujuAtPlayer(race)!.relAngle).toBeGreaterThan(1);
  });
});

describe('updateWarnings', () => {
  it('starts the hum once, keeps updating it, and stops it when the juju is gone', () => {
    const { race, at } = setup();
    race.hazards.push(juju(at.x + 20, at.z, 1));
    updateWarnings(race); updateWarnings(race);
    expect(loop.start).toHaveBeenCalledTimes(1);
    expect(loop.set).toHaveBeenCalledTimes(2);
    race.hazards = [];
    updateWarnings(race);
    expect(loop.stop).toHaveBeenCalledTimes(1);
  });

  it('stops the hum when the race is over with a juju still in flight', () => {
    const { race, at } = setup();
    race.hazards.push(juju(at.x + 20, at.z, 1));
    updateWarnings(race);
    race.phase = 'finished';
    updateWarnings(race);
    expect(loop.stop).toHaveBeenCalledTimes(1);
  });

  it('stops the hum when the player is knocked out', () => {
    const { me, race, at } = setup();
    race.hazards.push(juju(at.x + 20, at.z, 1));
    updateWarnings(race);
    me.outAt = 12;
    updateWarnings(race);
    expect(loop.stop).toHaveBeenCalledTimes(1);
  });
});
