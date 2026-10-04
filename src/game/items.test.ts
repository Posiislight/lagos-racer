import { describe, expect, it, vi } from 'vitest';
import { buildTrack, sampleAt } from './track';
import { createProgress } from './race';
import { makeRacer, type Hazard, type RaceRuntime, type Racer } from './runtime';
import { ITEM_LABEL, makePickups, updateItems } from './items';
import { VEHICLES } from '../config/vehicles';

const control: [number, number][] = [[0, 0], [50, 0], [70, 15], [70, 45], [50, 60], [-50, 60], [-70, 45], [-70, 15], [-50, 0]];
const track = buildTrack(control, 1);

/** A racer standing on the centre line `s` metres round, heading +x, with a stand-in physics body. */
function racerAt(id: number, s: number, isPlayer = false): Racer & { setLinvel: ReturnType<typeof vi.fn> } {
  const at = sampleAt(track, s).pos;
  const r = makeRacer(id, `R${id}`, VEHICLES[0], isPlayer, createProgress(track, at.x, at.z));
  const setLinvel = vi.fn();
  r.body = {
    translation: () => ({ x: at.x, y: at.y, z: at.z }),
    rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }),
    linvel: () => ({ x: 20, y: 0, z: 0 }),
    setLinvel,
  } as unknown as Racer['body'];
  return Object.assign(r, { setLinvel });
}

function raceWith(racers: Racer[]): RaceRuntime {
  return {
    config: { items: [100, 200], halfWidth: 6 }, track, racers, hazards: [], pickups: [], clock: 0, countdown: 0,
    phase: 'racing', playerFinishedAt: null, nextId: 1, puffs: [], critters: [],
  } as unknown as RaceRuntime;
}

const slick = (at: { x: number; z: number }, owner: number): Hazard =>
  ({ id: 99, kind: 'oil', x: at.x, y: 0, z: at.z, vx: 0, vy: 0, vz: 0, owner, target: null, life: 20, armed: 0, ground: 0 });
const juju = (at: { x: number; z: number }, owner: number, target: number): Hazard =>
  ({ id: 98, kind: 'juju', x: at.x, y: 0, z: at.z, vx: 0, vy: 0, vz: 0, owner, target, life: 7, armed: 0, ground: 0 });

describe('odeshi', () => {
  it('is labelled and offered in every pickup row', () => {
    expect(ITEM_LABEL.odeshi).toBe('Odeshi');
    const pickups = makePickups({ config: { items: [110, 300], halfWidth: 6 }, track } as unknown as RaceRuntime, () => 1);
    for (const s of [110, 300]) expect(pickups.filter(p => p.s === s).map(p => p.kind)).toContain('odeshi');
    expect(new Set(pickups.map(p => p.kind))).toEqual(new Set(['fuel', 'oil', 'juju', 'odeshi']));
  });

  it('puts up a shield for 8 seconds when used, and uses up the item', () => {
    const me = racerAt(1, 40, true);
    const race = raceWith([me]);
    me.item = 'odeshi';
    me.controls.useItem = true;
    updateItems(race, 0.016, vi.fn());
    expect(me.item).toBeNull();
    expect(me.shield).toBeGreaterThan(7.9);
    updateItems(race, 1, vi.fn());
    expect(me.shield).toBeCloseTo(6.98, 1);
  });

  it('keeps crude oil off a shielded racer, but not an unshielded one', () => {
    const owner = racerAt(1, 80), safe = racerAt(2, 40), caught = racerAt(3, 40);
    const race = raceWith([owner, safe, caught]);
    safe.shield = 5;
    race.hazards.push(slick(safe.body!.translation(), owner.id));
    const flash = vi.fn();
    updateItems(race, 0.016, flash);
    expect(safe.slip).toBe(0);
    expect(safe.immune).toBe(0);
    expect(caught.slip).toBeGreaterThan(0);
  });

  it('blocks a juju: no curse, no lost speed, and the juju is gone', () => {
    const thrower = racerAt(1, 20), target = racerAt(2, 40, true);
    const race = raceWith([thrower, target]);
    target.shield = 5;
    race.hazards.push(juju(target.body!.translation(), thrower.id, target.id));
    const flash = vi.fn();
    updateItems(race, 0.016, flash);
    expect(target.curse).toBe(0);
    expect(target.setLinvel).not.toHaveBeenCalled();
    expect(race.hazards.some(h => h.kind === 'juju')).toBe(false);
    expect(race.puffs.at(-1)?.color).toBe('odeshi');
    expect(flash).toHaveBeenCalledWith('ODESHI!');
  });

  it('still lets a juju land once the shield has run out', () => {
    const thrower = racerAt(1, 20), target = racerAt(2, 40);
    const race = raceWith([thrower, target]);
    target.shield = 0.5;
    updateItems(race, 1, vi.fn());
    expect(target.shield).toBe(0);
    race.hazards.push(juju(target.body!.translation(), thrower.id, target.id));
    updateItems(race, 0.016, vi.fn());
    expect(target.curse).toBeGreaterThan(0);
    expect(target.setLinvel).toHaveBeenCalled();
  });
});
