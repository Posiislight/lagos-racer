import { describe, expect, it, vi } from 'vitest';
import { type Hazard, type RaceRuntime } from './runtime';
import { ITEM_LABEL, jujuTarget, makePickups, updateItems } from './items';
import { racerAt, raceWith, track } from './testkit';

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

describe('soup patches', () => {
  it('do not act like crude oil: the oil rules only apply to oil', () => {
    const owner = racerAt(1, 80), caught = racerAt(2, 40);
    const race = raceWith([owner, caught]);
    const at = caught.body!.translation();
    race.hazards.push({ id: 97, kind: 'soup', x: at.x, y: 0, z: at.z, vx: 0, vy: 0, vz: 0, owner: owner.id, target: null, life: 9, armed: 0, ground: 0 });
    updateItems(race, 0.016, vi.fn());
    expect(caught.slip).toBe(0);
  });
});

describe('a racer who is out (knocked out of an elimination)', () => {
  it('is never the target of a juju', () => {
    const last = racerAt(1, 20), middle = racerAt(2, 40), leader = racerAt(3, 60);
    middle.outAt = 5;
    expect(jujuTarget(raceWith([last, middle, leader]), last)).toBe(leader);
  });

  it('does not pick up an item, while a racer still in takes it from the same orb', () => {
    const out = racerAt(1, 40), inRace = racerAt(2, 40);
    out.outAt = 5;
    const at = out.body!.translation();
    const orb = () => ({ id: 1, kind: 'fuel' as const, x: at.x, y: at.y, z: at.z, s: 40, respawn: 0 });
    const a = raceWith([out]);
    a.pickups.push(orb());
    updateItems(a, 0.016, vi.fn());
    expect(out.item).toBeNull();
    expect(a.pickups[0].respawn).toBe(0);
    const b = raceWith([out, inRace]);
    b.pickups.push(orb());
    updateItems(b, 0.016, vi.fn());
    expect(inRace.item).toBe('fuel');
  });

  it('is not cursed by a juju that reaches it', () => {
    const thrower = racerAt(1, 20), out = racerAt(2, 40);
    out.outAt = 5;
    const race = raceWith([thrower, out]);
    race.hazards.push(juju(out.body!.translation(), thrower.id, out.id));
    updateItems(race, 0.016, vi.fn());
    expect(out.curse).toBe(0);
    expect(out.setLinvel).not.toHaveBeenCalled();
  });

  it('is not slicked by crude oil', () => {
    const owner = racerAt(1, 80), out = racerAt(2, 40);
    out.outAt = 5;
    const race = raceWith([owner, out]);
    race.hazards.push(slick(out.body!.translation(), owner.id));
    updateItems(race, 0.016, vi.fn());
    expect(out.slip).toBe(0);
  });

  it('cannot use an item it was holding', () => {
    const out = racerAt(1, 40);
    out.outAt = 5; out.item = 'fuel'; out.controls.useItem = true;
    updateItems(raceWith([out]), 0.016, vi.fn());
    expect(out.boost).toBe(0);
  });
});
