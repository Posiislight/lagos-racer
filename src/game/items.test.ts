import { describe, expect, it, vi } from 'vitest';
import { buildTrack, sampleAt } from './track';
import { createProgress } from './race';
import { makeRacer, type Hazard, type NetHooks, type RaceRuntime, type Racer } from './runtime';
import { ITEM_LABEL, jujuTarget, makePickups, updateItems } from './items';
import type { TrackConfig } from '../config/tracks';
import { VEHICLES, vehicleById } from '../config/vehicles';
import { SnapshotBuffer } from '../net/interpolation';
import { ClockSync } from '../net/clock';
import type { ClientMessage } from '../net/protocol';
import { NetSession } from '../net/session';

// The 100 x 60 rounded rectangle from race.test.ts, driven from (0, 0) heading +x.
const control: [number, number][] = [[0, 0], [50, 0], [70, 15], [70, 45], [50, 60], [-50, 60], [-70, 45], [-70, 15], [-50, 0]];
const track = buildTrack(control, 1);
const config = { id: 'test', control, halfWidth: 6.5, laps: 3, items: [20], bridges: [], zones: [] } as unknown as TrackConfig;

/** A stand-in rigid body facing +x that the test can move about. */
function fakeBody(x: number, z: number) {
  const pos = { x, y: 0.5, z };
  let vel = { x: 0, y: 0, z: 0 };
  return {
    pos,
    translation: () => pos,
    rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }),
    linvel: () => vel,
    setLinvel: vi.fn((v: typeof vel) => { vel = v; }),
  };
}

type TestRacer = Racer & { fake: ReturnType<typeof fakeBody> };

/** A racer at track distance s (and lateral offset), driven by this phone or another. */
function racer(id: number, kind: Racer['kind'], s: number, lateral = 0): TestRacer {
  const at = sampleAt(track, s);
  const x = at.pos.x + at.right.x * lateral, z = at.pos.z + at.right.z * lateral;
  const r = makeRacer(id, `r${id}`, vehicleById('okada'), vehicleById('okada').paints[0], kind === 'local', createProgress(track, x, z)) as TestRacer;
  r.kind = kind;
  if (kind === 'remote') r.remote = { buffer: new SnapshotBuffer(), dnf: false };
  r.fake = fakeBody(x, z);
  r.body = r.fake as unknown as Racer['body'];
  return r;
}

function makeTestRace(racers: Racer[], net: NetHooks | null = null): RaceRuntime {
  let id = 1;
  return {
    config, track, racers, hazards: [], pickups: makePickups({ config, track }, () => id++), clock: 5, countdown: 0,
    phase: 'racing', playerFinishedAt: null, nextId: net ? 100000 : 1000, puffs: [], critters: [], net,
  };
}

function fakeNet() {
  return { started: true, now: () => 5, update: vi.fn(), pickup: vi.fn(), use: vi.fn(), hit: vi.fn(), finish: vi.fn() } satisfies NetHooks;
}

const oil = (id: number, x: number, z: number, owner: number): Hazard =>
  ({ id, kind: 'oil', x, y: 0, z, vx: 0, vy: 0, vz: 0, owner, target: null, life: 22, armed: 0, ground: 0 });

const step = (race: RaceRuntime, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) updateItems(race, 1 / 60, () => {});
};

describe('items', () => {
  it('offline behaviour unchanged: the player picks up an orb and juju hits the AI ahead', () => {
    const ai = racer(0, 'ai', 40);
    const player = racer(1, 'local', 18);
    const race = makeTestRace([ai, player]);
    const orb = race.pickups[0];
    player.fake.pos.x = orb.x;
    player.fake.pos.z = orb.z;
    updateItems(race, 1 / 60, () => {});
    expect(player.item).toBe(orb.kind);
    expect(orb.respawn).toBe(3);

    player.item = 'juju';
    player.controls.useItem = true;
    updateItems(race, 1 / 60, () => {});
    expect(player.item).toBeNull();
    expect(race.hazards).toHaveLength(1);
    expect(race.hazards[0]).toMatchObject({ id: 1000, kind: 'juju', owner: 1, target: 0 });

    step(race, 1);
    expect(race.hazards).toHaveLength(0);
    expect(ai.curse).toBeGreaterThan(0);
    expect(ai.fake.setLinvel).toHaveBeenCalled();
    expect(race.puffs).toHaveLength(1);
  });

  it('remote racers do not pick up orbs locally', () => {
    const remote = racer(0, 'remote', 18);
    const race = makeTestRace([remote], fakeNet());
    const orb = race.pickups[0];
    remote.fake.pos.x = orb.x;
    remote.fake.pos.z = orb.z;
    remote.controls.useItem = true;
    updateItems(race, 1 / 60, () => {});
    expect(remote.item).toBeNull();
    expect(orb.respawn).toBe(0);
    expect(race.hazards).toHaveLength(0);
  });

  it('a pickup by a local car calls net.pickup with the orb id', () => {
    const net = fakeNet();
    const ai = racer(0, 'ai', 18);
    const race = makeTestRace([ai], net);
    const orb = race.pickups[2];
    ai.fake.pos.x = orb.x;
    ai.fake.pos.z = orb.z;
    updateItems(race, 1 / 60, () => {});
    expect(ai.item).toBe(orb.kind);
    expect(net.pickup).toHaveBeenCalledWith(orb.id);

    // Throwing sends the new hazard, numbered from this phone's block.
    ai.item = 'oil';
    ai.controls.useItem = true;
    updateItems(race, 1 / 60, () => {});
    expect(net.use).toHaveBeenCalledTimes(1);
    expect(net.use.mock.calls[0][0]).toMatchObject({ id: 100000, kind: 'oil', owner: 0 });
  });

  it('oil does not affect a remote racer locally; it affects a local one and calls net.hit', () => {
    const net = fakeNet();
    const remote = racer(0, 'remote', 30);
    const local = racer(1, 'local', 60);
    const race = makeTestRace([remote, local], net);
    race.pickups = [];
    race.hazards.push(oil(200001, remote.fake.pos.x, remote.fake.pos.z, 5), oil(200002, local.fake.pos.x, local.fake.pos.z, 5));
    updateItems(race, 1 / 60, () => {});
    expect(remote.slip).toBe(0);
    expect(local.slip).toBeGreaterThan(0);
    expect(net.hit).toHaveBeenCalledTimes(1);
    expect(net.hit).toHaveBeenCalledWith(200002, 1);
    expect(race.hazards.find(h => h.id === 200001)!.life).toBeGreaterThan(8);
    expect(race.hazards.find(h => h.id === 200002)!.life).toBeLessThanOrEqual(8);
  });

  it('juju aimed at a remote car keeps homing and is only removed by a hit event', () => {
    const sent: ClientMessage[] = [];
    const session = new NetSession({ sendJson: m => { sent.push(m); }, sendBinary: () => {} }, new ClockSync(), { grid: [], mySlot: 1, seed: 1, raceSeq: 1 });
    const remote = racer(0, 'remote', 40, 4);
    const local = racer(1, 'local', 18);
    const race = makeTestRace([remote, local]);
    race.pickups = [];
    session.attach(race);
    local.item = 'juju';
    local.controls.useItem = true;
    updateItems(race, 1 / 60, () => {});
    const h = race.hazards[0];
    expect(h).toMatchObject({ kind: 'juju', target: 0 });
    expect(sent).toEqual([{ t: 'use', hazard: expect.objectContaining({ id: h.id, kind: 'juju', target: 0 }) }]);

    // It turns towards the remote car (off to the right of the line), flies through it and keeps circling.
    step(race, 0.2);
    const right = sampleAt(track, 40).right;
    expect(h.vx * right.x + h.vz * right.z).toBeGreaterThan(0);
    step(race, 1.5);
    expect(race.hazards).toEqual([h]);
    expect(remote.curse).toBe(0);
    expect(remote.fake.setLinvel).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);

    // The victim's phone says it landed.
    session.onEvent({ t: 'hit', hazard: h.id, netId: 0, from: 2 });
    expect(race.puffs).toEqual([expect.objectContaining({ x: h.x, z: h.z, color: 'juju' })]);
    updateItems(race, 1 / 60, () => {});
    expect(race.hazards).toHaveLength(0);
  });

  it('a DNF car parked under its grid spot picks up nothing and smears no oil', () => {
    const me = racer(0, 'local', 0);
    const dnf = racer(1, 'remote', 0);
    dnf.remote!.dnf = true;
    const race = makeTestRace([me, dnf], fakeNet());
    const orb = race.pickups[0];
    // Parked far below the road, but right under an orb and a slick as far as x and z go.
    dnf.fake.pos.x = orb.x; dnf.fake.pos.y = -200; dnf.fake.pos.z = orb.z;
    race.hazards.push(oil(100001, orb.x, orb.z, 0));
    step(race, 0.1);
    expect(orb.respawn).toBe(0);
    expect(dnf.item).toBeNull();
    expect(race.hazards[0].life).toBeGreaterThan(21);
    expect(race.net!.pickup).not.toHaveBeenCalled();
    expect(race.net!.hit).not.toHaveBeenCalled();
  });

  it('juju never targets a DNF racer', () => {
    const ahead = racer(0, 'remote', 80);
    const dnf = racer(1, 'remote', 50);
    const me = racer(2, 'local', 20);
    dnf.remote!.dnf = true;
    const race = makeTestRace([ahead, dnf, me], fakeNet());
    race.pickups = [];
    expect(jujuTarget(race, me)?.id).toBe(0);

    // A juju already flying at someone who then drops out no longer steers at them.
    race.hazards.push({ id: 100000, kind: 'juju', x: 30, y: 2, z: 0, vx: 46, vy: 0, vz: 0, owner: 2, target: 1, life: 7, armed: 0, ground: 0 });
    dnf.fake.pos.z = 30;
    step(race, 0.2);
    expect(race.hazards[0].vz).toBe(0);
  });
});

/** A racer standing on the centre line `s` metres round, heading +x, with a stand-in physics body. */
function racerAt(id: number, s: number, isPlayer = false): Racer & { setLinvel: ReturnType<typeof vi.fn> } {
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
