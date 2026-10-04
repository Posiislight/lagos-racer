import { describe, expect, it, vi } from 'vitest';
import { racerAt, raceWith } from './testkit';
import { speedFactors, updateSpecials } from './specials';
import { updateItems } from './items';
import { SPECIALS } from '../config/drivers';
import type { Hazard, RaceRuntime } from './runtime';

const soupAt = (at: { x: number; z: number }, owner: number): Hazard =>
  ({ id: 97, kind: 'soup', x: at.x, y: 0, z: at.z, vx: 0, vy: 0, vz: 0, owner, target: null, life: 9, armed: 0, ground: 0 });
const soups = (race: RaceRuntime) => race.hazards.filter(h => h.kind === 'soup');
/** Run `frames` steps of `dt`. */
const step = (race: RaceRuntime, frames: number, dt: number, flash = vi.fn()) => { for (let i = 0; i < frames; i++) updateSpecials(race, dt, flash); };

describe('the special meter', () => {
  it('charges at 1/30 per second, only while racing', () => {
    const me = racerAt(1, 40, true), race = raceWith([me]);
    race.phase = 'countdown';
    updateSpecials(race, 1, vi.fn());
    expect(me.charge).toBe(0);
    race.phase = 'racing';
    updateSpecials(race, 15, vi.fn());
    expect(me.charge).toBeCloseTo(0.5, 2);
    updateSpecials(race, 30, vi.fn());
    expect(me.charge).toBe(1);
  });

  it('does not charge once the racer has finished', () => {
    const me = racerAt(1, 40, true), race = raceWith([me]);
    me.progress.finishTime = 12;
    updateSpecials(race, 5, vi.fn());
    expect(me.charge).toBe(0);
  });

  it('needs a full meter to fire, and swallows the press either way', () => {
    const me = racerAt(1, 40, true), race = raceWith([me]);
    me.charge = 0.5;
    me.controls.special = true;
    updateSpecials(race, 0.016, vi.fn());
    expect(me.push).toBe(0);
    expect(me.charge).toBeCloseTo(0.5, 2);
    expect(me.controls.special).toBe(false);
  });

  it('does nothing in the countdown or without a physics body, and keeps the charge', () => {
    const me = racerAt(1, 40, true), race = raceWith([me]);
    me.charge = 1;
    me.controls.special = true;
    race.phase = 'countdown';
    updateSpecials(race, 0.016, vi.fn());
    expect(me.push).toBe(0);
    expect(me.charge).toBe(1);
    race.phase = 'racing';
    me.body = null;
    me.controls.special = true;
    updateSpecials(race, 0.016, vi.fn());
    expect(me.push).toBe(0);
    expect(me.charge).toBe(1);
  });

  it('fires a special and a held item on the same frame without either cancelling the other', () => {
    const me = racerAt(1, 40, true), race = raceWith([me]);
    me.item = 'fuel';
    me.charge = 1;
    me.controls.useItem = true;
    me.controls.special = true;
    updateItems(race, 0.016, vi.fn());
    updateSpecials(race, 0.016, vi.fn());
    expect(me.boost).toBeGreaterThan(0);
    expect(me.push).toBeGreaterThan(0);
    expect(me.item).toBeNull();
    expect(me.charge).toBe(0);
  });
});

describe('Push Squad', () => {
  it('pushes for 4 seconds, spending the meter', () => {
    const me = racerAt(1, 40, true), race = raceWith([me]);
    me.driver = 'moshood';
    me.charge = 1;
    me.controls.special = true;
    updateSpecials(race, 0.016, vi.fn());
    expect(me.push).toBeCloseTo(SPECIALS.push.duration, 1);
    expect(me.charge).toBe(0);
    updateSpecials(race, 4.1, vi.fn());
    expect(me.push).toBe(0);
  });
});

describe('Pepper Soup Trail', () => {
  const mamaAt = (id: number, s: number, speed: number) => {
    const r = racerAt(id, s);
    r.driver = 'mamaput';
    r.charge = 1;
    r.speed = speed;
    r.controls.special = true;
    return r;
  };

  it('drops a patch every 3.5 m travelled, behind the vehicle, owned by it', () => {
    const mama = mamaAt(1, 40, 28), race = raceWith([mama]);
    updateSpecials(race, 0.016, vi.fn()); // fires
    expect(mama.trail).toBeGreaterThan(0);
    step(race, 10, 0.1);
    expect(soups(race).length).toBeGreaterThanOrEqual(7);
    expect(soups(race).length).toBeLessThanOrEqual(9);
    const x = mama.body!.translation().x;
    for (const h of soups(race)) { expect(h.x).toBeLessThan(x); expect(h.owner).toBe(1); }
  });

  it('drops nothing while the vehicle is standing still', () => {
    const mama = mamaAt(1, 40, 0), race = raceWith([mama]);
    updateSpecials(race, 0.016, vi.fn());
    step(race, 30, 0.1);
    expect(soups(race)).toHaveLength(0);
  });

  it('stops after 5 seconds and never drops more than 40 patches, however fast', () => {
    const mama = mamaAt(1, 40, 100), race = raceWith([mama]);
    updateSpecials(race, 0.016, vi.fn());
    step(race, 70, 0.1);
    expect(mama.trail).toBe(0);
    expect(soups(race).length).toBeLessThanOrEqual(SPECIALS.soup.maxPatches);
    expect(soups(race).length).toBeGreaterThan(30);
  });

  it('makes a racer cough for longer if the vehicle is flimsy, and gives them time to drive out', () => {
    const owner = racerAt(1, 40), victim = racerAt(2, 40, true), race = raceWith([owner, victim]);
    race.hazards.push(soupAt(victim.body!.translation(), owner.id));
    const flash = vi.fn();
    updateSpecials(race, 0.016, flash);
    expect(victim.cough).toBeCloseTo(SPECIALS.soup.cough * (1.25 - victim.vehicle.stats.toughness * 0.055), 2);
    expect(victim.immune).toBeGreaterThan(victim.cough);
    expect(flash).toHaveBeenCalledWith('COUGH!');
  });

  it('is blocked by odeshi', () => {
    const owner = racerAt(1, 40), victim = racerAt(2, 40, true), race = raceWith([owner, victim]);
    victim.shield = 5;
    race.hazards.push(soupAt(victim.body!.translation(), owner.id));
    updateSpecials(race, 0.016, vi.fn());
    expect(victim.cough).toBe(0);
    expect(victim.immune).toBe(0);
  });

  it('never hurts its owner, but another Mama Put\'s soup does', () => {
    const a = racerAt(1, 40), b = racerAt(2, 40), race = raceWith([a, b]);
    a.driver = b.driver = 'mamaput';
    race.hazards.push(soupAt(a.body!.translation(), a.id));
    updateSpecials(race, 0.016, vi.fn());
    expect(a.cough).toBe(0);
    expect(b.cough).toBeGreaterThan(0);
  });
});

describe('speedFactors', () => {
  const none = { boost: 0, curse: 0, push: 0, cough: 0 };
  it('is 1 when nothing is going on', () => {
    expect(speedFactors(none)).toEqual({ accel: 1, top: 1 });
  });

  it('keeps fuel and juju exactly as they were', () => {
    expect(speedFactors({ ...none, boost: 1 })).toEqual({ accel: 2.2, top: 1.3 });
    expect(speedFactors({ ...none, curse: 1 })).toEqual({ accel: 0.55, top: 0.62 });
  });

  it('gives Push Squad a steady boost and the cough a slowdown', () => {
    expect(speedFactors({ ...none, push: 1 })).toEqual({ accel: 1.6, top: 1.18 });
    expect(speedFactors({ ...none, cough: 1 })).toEqual({ accel: 0.7, top: 0.7 });
  });

  it('stacks fuel and Push Squad', () => {
    const f = speedFactors({ ...none, boost: 1, push: 1 });
    expect(f.accel).toBeCloseTo(3.52, 5);
    expect(f.top).toBeCloseTo(1.534, 3);
  });
});
