import { afterEach, describe, expect, it, vi } from 'vitest';
import { FLAG, decodeSnapshot, encodeSnapshot, type CarState, type ClientMessage, type RoomView } from './protocol';
import type { Hazard, RaceRuntime, Racer } from '../game/runtime';
import { makeRacer } from '../game/runtime';
import { vehicleById } from '../config/vehicles';
import { SnapshotBuffer } from './interpolation';
import { ClockSync } from './clock';
import type { NetLink } from './connection';
import { NetSession } from './session';
import { sfx } from '../game/audio';
import { Referee } from '../../server/referee';
import { track } from '../game/testkit';
import { sampleAt } from '../game/track';
import { createProgress, updateProgress } from '../game/race';

vi.mock('../game/audio', () => ({ sfx: vi.fn() }));

function fakeLink() {
  const sent: ClientMessage[] = [];
  const binary: ArrayBuffer[] = [];
  const link: NetLink = { sendJson: m => { sent.push(m); }, sendBinary: b => { binary.push(b); } };
  return { link, sent, binary };
}

/** A clock whose server time runs 10 s ahead of performance.now(). */
function clockAhead() {
  const clock = new ClockSync();
  clock.addSample(0, 10000, 0);
  return clock;
}

const setup = { grid: [], mySlot: 1, seed: 7, raceSeq: 1, quick: false };

describe('NetSession', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('now() is negative before start and counts seconds from the server start time', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const s = new NetSession(fakeLink().link, clockAhead(), setup);
    expect(s.started).toBe(false);
    expect(s.now()).toBe(-3.5);
    // Server time is now 11000: the start is 3 s away.
    s.setStart(14000);
    expect(s.started).toBe(true);
    expect(s.now()).toBeCloseTo(-3);
    now.mockReturnValue(6500);
    expect(s.now()).toBeCloseTo(2.5);
  });

  it('sends loaded exactly once', () => {
    const { link, sent } = fakeLink();
    const s = new NetSession(link, clockAhead(), setup);
    s.loaded();
    s.loaded();
    expect(sent).toEqual([{ t: 'loaded' }]);
  });

  it('after a resume re-sends loaded until the start is known (it may have been lost in the drop)', () => {
    const { link, sent } = fakeLink();
    const s = new NetSession(link, clockAhead(), setup);
    s.resumed();
    expect(sent).toEqual([]);
    s.loaded();
    s.resumed();
    expect(sent).toEqual([{ t: 'loaded' }, { t: 'loaded' }]);
    s.setStart(20000);
    s.resumed();
    expect(sent).toHaveLength(2);
  });

  it('attach makes the session the race hooks', () => {
    const s = new NetSession(fakeLink().link, clockAhead(), setup);
    const race = { net: null } as unknown as Parameters<NetSession['attach']>[0];
    s.attach(race);
    expect(race.net).toBe(s);
  });

  describe('snapshots', () => {
    const progress = () => ({ index: 0, s: 0, distance: 0, lapsDone: 0, lapTimes: [], lapStart: 0, finishTime: null, lateral: 0 });
    const fakeBody = (x: number) => ({
      translation: () => ({ x, y: 1, z: 2 }),
      rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }),
      linvel: () => ({ x: 3, y: 0, z: 0 }),
      bodyType: () => 2, setBodyType: vi.fn(), setTranslation: vi.fn(), setRotation: vi.fn(), setLinvel: vi.fn(), setAngvel: vi.fn(), enableCcd: vi.fn(),
    }) as unknown as Racer['body'];

    function racer(id: number, kind: Racer['kind'], owner: number): Racer {
      const r = makeRacer(id, `r${id}`, vehicleById('okada'), vehicleById('okada').paints[0], kind === 'local', progress());
      r.kind = kind;
      r.owner = owner;
      if (kind === 'remote') r.remote = { buffer: new SnapshotBuffer(), dnf: false };
      // Remote cars have a (kinematic) body too, so the send filter must go by kind.
      r.body = fakeBody(id * 10);
      return r;
    }

    /** Netids 0 local (mine), 1 ai (mine), 2 remote of slot 2. Mine is slot 1; the clock reads performance.now() seconds. */
    function started(ms = 1000) {
      const now = vi.spyOn(performance, 'now').mockReturnValue(ms);
      const { link, sent, binary } = fakeLink();
      const flash = vi.fn();
      const s = new NetSession(link, clockAhead(), setup, flash);
      const racers = [racer(0, 'local', 1), racer(1, 'ai', 1), racer(2, 'remote', 2)];
      const race = { racers, net: null, track: { length: 400 } } as unknown as RaceRuntime;
      s.attach(race);
      // Server time is ms + 10000; a start at 10000 puts now() at ms / 1000.
      s.setStart(10000);
      return { s, race, racers, binary, sent, now, flash };
    }

    const carFor = (netId: number, over: Partial<CarState> = {}): CarState =>
      ({ netId, x: 5, y: 1, z: 6, qx: 0, qy: 0, qz: 0, qw: 1, vx: 0, vy: 0, vz: 0, distance: 0, laps: 0, flags: 0, ...over });
    const snapBuf = (slot: number, raceSeq: number, time: number, cars: CarState[]) => encodeSnapshot({ slot, raceSeq, time, cars });

    it('sends one snapshot per 1/15 s containing only local and ai cars', () => {
      const { s, race, racers, binary, now } = started(1000);
      racers[0].progress.distance = 12.5;
      racers[0].progress.lapsDone = 1;
      racers[0].boost = 0.5;
      racers[0].controls.horn = true;
      racers[1].slip = 1;
      racers[1].progress.finishTime = 30;
      s.update(race);
      expect(binary).toHaveLength(1);
      now.mockReturnValue(1030);
      s.update(race);
      expect(binary).toHaveLength(1);
      now.mockReturnValue(1070);
      s.update(race);
      expect(binary).toHaveLength(2);

      const snap = decodeSnapshot(binary[0])!;
      expect(snap.slot).toBe(1);
      expect(snap.raceSeq).toBe(1);
      expect(snap.time).toBeCloseTo(1);
      expect(snap.cars.map(c => c.netId)).toEqual([0, 1]);
      const [a, b] = snap.cars;
      expect(a.x).toBeCloseTo(0);
      expect(a.y).toBeCloseTo(1);
      expect(a.z).toBeCloseTo(2);
      expect(a.vx).toBeCloseTo(3);
      expect(a.distance).toBeCloseTo(12.5);
      expect(a.laps).toBe(1);
      expect(a.flags).toBe(FLAG.boost | FLAG.horn);
      expect(b.x).toBeCloseTo(10);
      expect(b.flags).toBe(FLAG.slip | FLAG.finished);
    });

    it('latches a one-frame horn until the next snapshot, then clears it', () => {
      const { s, race, racers, binary, now } = started(1000);
      s.update(race);
      // An AI toots for a single frame between sends.
      now.mockReturnValue(1030);
      racers[1].controls.horn = true;
      s.update(race);
      racers[1].controls.horn = false;
      now.mockReturnValue(1070);
      s.update(race);
      now.mockReturnValue(1140);
      s.update(race);
      expect(binary).toHaveLength(3);
      const hornOf = (i: number) => decodeSnapshot(binary[i])!.cars.map(c => (c.flags & FLAG.horn) !== 0);
      expect(hornOf(0)).toEqual([false, false]);
      expect(hornOf(1)).toEqual([false, true]);
      expect(hornOf(2)).toEqual([false, false]);
    });

    it('after a 20 s frame gap sends one snapshot, not a burst', () => {
      const { s, race, binary, now } = started(1000);
      s.update(race);
      now.mockReturnValue(21000);
      s.update(race);
      expect(binary).toHaveLength(2);
      // The next send is 1/15 s after the late one, not owed from the gap.
      now.mockReturnValue(21030);
      s.update(race);
      expect(binary).toHaveLength(2);
      now.mockReturnValue(21070);
      s.update(race);
      expect(binary).toHaveLength(3);
    });

    it('sends nothing until the start time is known', () => {
      const { link, binary } = fakeLink();
      const s = new NetSession(link, clockAhead(), setup);
      const race = { racers: [racer(0, 'local', 1)], net: null } as unknown as RaceRuntime;
      s.attach(race);
      s.update(race);
      expect(binary).toHaveLength(0);
    });

    it('applies remote distance, laps and effect flags', () => {
      const { s, racers } = started(1000);
      const remote = racers[2];
      s.onSnapshot(snapBuf(2, 1, 0.9, [carFor(2, { x: 7, distance: 42, laps: 2, flags: FLAG.boost | FLAG.curse | FLAG.horn })]));
      expect(remote.progress.distance).toBeCloseTo(42);
      expect(remote.progress.lapsDone).toBe(2);
      expect(remote.boost).toBe(1);
      expect(remote.slip).toBe(0);
      expect(remote.curse).toBe(1);
      expect(remote.wobble).toBe(0);
      expect(remote.controls.horn).toBe(true);
      expect(remote.remote!.buffer.latest()?.x).toBeCloseTo(7);
      // The lateness measured at receipt is now() - snapshot time.
      expect(remote.remote!.buffer.delay).toBeCloseTo(0.1 + 0.1);
      s.onSnapshot(snapBuf(2, 1, 0.95, [carFor(2, { distance: 43, laps: 2, flags: FLAG.wobble | FLAG.slip })]));
      expect(remote.boost).toBe(0);
      expect(remote.slip).toBe(1);
      expect(remote.wobble).toBe(1);
      expect(remote.controls.horn).toBe(false);
    });

    it('ignores unknown netIds and cars this phone drives itself', () => {
      const { s, racers } = started(1000);
      s.onSnapshot(snapBuf(2, 1, 0.9, [carFor(9, { distance: 5 }), carFor(0, { distance: 99 })]));
      expect(racers[0].progress.distance).toBe(0);
      expect(racers[2].remote!.buffer.latest()).toBeNull();
    });

    it('sends pickups, throws and hits to the room', () => {
      const { s, sent } = started(1000);
      const h: Hazard = { id: 100001, kind: 'oil', x: 1, y: 0, z: 2, vx: 0, vy: 0, vz: 0, owner: 0, target: null, life: 22, armed: 1, ground: 0 };
      s.pickup(7);
      s.use(h);
      h.life = 3;
      s.hit(200004, 1);
      expect(sent).toEqual([
        { t: 'pickup', orb: 7 },
        { t: 'use', hazard: { ...h, life: 22 } },
        { t: 'hit', hazard: 200004, netId: 1 },
      ]);
    });

    it('applies other phones\' pickups, throws and hits', () => {
      const { s, race } = started(1000);
      race.pickups = [{ id: 3, kind: 'oil', x: 0, y: 0, z: 0, s: 0, respawn: 0 }];
      race.hazards = [];
      race.puffs = [];
      const juju: Hazard = { id: 200001, kind: 'juju', x: 4, y: 2, z: 5, vx: 40, vy: 0, vz: 0, owner: 2, target: 0, life: 7, armed: 0.6, ground: 0.5 };
      const oil: Hazard = { ...juju, id: 200002, kind: 'oil', target: null, life: 22 };

      s.onEvent({ t: 'pickup', orb: 3, from: 2 });
      expect(race.pickups[0].respawn).toBe(3);
      s.onEvent({ t: 'pickup', orb: 99, from: 2 });

      s.onEvent({ t: 'use', hazard: juju, from: 2 });
      s.onEvent({ t: 'use', hazard: oil, from: 2 });
      s.onEvent({ t: 'use', hazard: { ...juju, x: 50 }, from: 2 });
      expect(race.hazards).toEqual([juju, oil]);
      expect(race.hazards[0]).not.toBe(juju);

      s.onEvent({ t: 'hit', hazard: 999, netId: 0, from: 2 });
      expect(race.puffs).toEqual([]);
      s.onEvent({ t: 'hit', hazard: 200002, netId: 1, from: 2 });
      expect(race.hazards[1].life).toBe(8);
      s.onEvent({ t: 'hit', hazard: 200001, netId: 1, from: 2 });
      expect(race.hazards[0].life).toBe(0);
      expect(race.puffs).toEqual([{ x: 4, y: 0.5, z: 5, age: 0, color: 'juju' }]);
      expect(sfx).not.toHaveBeenCalled();
    });

    it('plays the juju sound when my juju lands on another phone\'s car, not my AI\'s', () => {
      const { s, race } = started(1000);
      race.puffs = [];
      const mine: Hazard = { id: 100001, kind: 'juju', x: 4, y: 2, z: 5, vx: 40, vy: 0, vz: 0, owner: 0, target: 2, life: 7, armed: 0.6, ground: 0.5 };
      race.hazards = [mine, { ...mine, id: 100002, owner: 1 }];
      s.onEvent({ t: 'hit', hazard: 100002, netId: 2, from: 2 });
      expect(sfx).not.toHaveBeenCalled();
      s.onEvent({ t: 'hit', hazard: 100001, netId: 2, from: 2 });
      expect(sfx).toHaveBeenCalledExactlyOnceWith('juju');
    });

    it('sends a finish with the lap times, and only once the car has finished', () => {
      const { s, racers, sent } = started(1000);
      s.finish(racers[0]);
      racers[1].progress.lapTimes = [30.5, 29.25, 29];
      racers[1].progress.finishTime = 88.75;
      s.finish(racers[1]);
      racers[1].progress.lapTimes.push(1);
      expect(sent).toEqual([{ t: 'finish', netId: 1, laps: [30.5, 29.25, 29], time: 88.75 }]);
    });

    it('marks another phone\'s car finished, never one of mine', () => {
      const { s, racers } = started(1000);
      s.onEvent({ t: 'finished', netId: 2, time: 91.5 });
      s.onEvent({ t: 'finished', netId: 0, time: 80 });
      s.onEvent({ t: 'finished', netId: 9, time: 80 });
      expect(racers.map(r => r.progress.finishTime)).toEqual([null, null, 91.5]);
    });

    it('dnf hides remote cars; dnf of my own car only flashes the message', () => {
      const { s, racers, flash } = started(1000);
      s.onEvent({ t: 'dnf', netIds: [2] });
      expect(racers[2].remote!.dnf).toBe(true);
      expect(flash).not.toHaveBeenCalled();
      // My AI dropping out says nothing; my own car keeps driving here, the room just won't count it.
      s.onEvent({ t: 'dnf', netIds: [1] });
      expect(flash).not.toHaveBeenCalled();
      s.onEvent({ t: 'dnf', netIds: [0, 9] });
      expect(flash).toHaveBeenCalledExactlyOnceWith('Network wahala');
      expect(racers[0].remote).toBeNull();
    });

    it('remembers a dnf that arrives before the race is attached', () => {
      const s = new NetSession(fakeLink().link, clockAhead(), setup);
      s.onEvent({ t: 'dnf', netIds: [2] });
      const remote = racer(2, 'remote', 2);
      s.attach({ racers: [racer(0, 'local', 1), remote], net: null } as unknown as RaceRuntime);
      expect(remote.remote!.dnf).toBe(true);
    });

    it('re-sends a finish the room never answered, until it does', () => {
      const { s, racers, sent } = started(1000);
      for (const r of [racers[0], racers[1]]) {
        r.progress.lapTimes = [30, 30, 30];
        r.progress.finishTime = 90;
        s.finish(r);
      }
      const claim = (netId: number) => ({ t: 'finish', netId, laps: [30, 30, 30], time: 90 });
      expect(sent).toEqual([claim(0), claim(1)]);
      // The room accepted car 1 (its finished comes back to us too); car 0's claim was lost in a drop.
      s.onEvent({ t: 'finished', netId: 1, time: 90 });
      s.resumed();
      expect(sent).toEqual([claim(0), claim(1), claim(0)]);
      s.onEvent({ t: 'finished', netId: 0, time: 90 });
      s.resumed();
      expect(sent).toHaveLength(3);
    });

    it('re-sends unanswered finishes every 2 s until finished, dnf or results', () => {
      const { s, race, racers, sent, now } = started(1000);
      for (const r of [racers[0], racers[1]]) {
        r.progress.lapTimes = [30, 30, 30];
        r.progress.finishTime = 90;
        s.finish(r);
      }
      const claims = () => sent.filter(m => m.t === 'finish').map(m => (m as { netId: number }).netId);
      expect(claims()).toEqual([0, 1]);
      now.mockReturnValue(2900);
      s.update(race);
      expect(claims()).toEqual([0, 1]);
      now.mockReturnValue(3000);
      s.update(race);
      expect(claims()).toEqual([0, 1, 0, 1]);
      s.onEvent({ t: 'finished', netId: 1, time: 90 });
      now.mockReturnValue(5000);
      s.update(race);
      expect(claims()).toEqual([0, 1, 0, 1, 0]);
      // A refused claim comes back as a dnf: nothing left to claim for that car.
      s.onEvent({ t: 'dnf', netIds: [0] });
      now.mockReturnValue(7000);
      s.update(race);
      expect(claims()).toHaveLength(5);

      const other = started(1000);
      other.racers[0].progress.lapTimes = [30, 30, 30];
      other.racers[0].progress.finishTime = 90;
      other.s.finish(other.racers[0]);
      expect(other.s.onResults()).toBe(true);
      other.now.mockReturnValue(9000);
      other.s.update(other.race);
      expect(other.sent.filter(m => m.t === 'finish')).toHaveLength(1);
    });

    it('takes the results only once', () => {
      const { s } = started(1000);
      expect(s.onResults()).toBe(true);
      expect(s.onResults()).toBe(false);
    });

    it('is stranded when the room is back in the lobby after my race and no results came', () => {
      const { s } = started(1000);
      const view = (phase: RoomView['phase'], raceSeq: number): RoomView =>
        ({ code: 'ABCD', phase, hostSlot: 1, fillAI: false, raceSeq, players: [] });
      expect(s.stranded(view('racing', 1))).toBe(false);
      expect(s.stranded(view('lobby', 2))).toBe(false);
      expect(s.stranded(view('lobby', 1))).toBe(true);
      s.onResults();
      expect(s.stranded(view('lobby', 1))).toBe(false);
    });

    describe('adopt (Quick race: a bot whose phone left is handed to this one)', () => {
      const mocks = (r: Racer) => r.body as unknown as Record<'setBodyType' | 'setTranslation' | 'setRotation' | 'setLinvel' | 'setAngvel', ReturnType<typeof vi.fn>>;

      it('adopt turns a remote car into a locally driven ai car at its last pose', () => {
        const { s, racers, now } = started(41000);
        const car = racers[2];
        s.onSnapshot(snapBuf(2, 1, 40.8, [carFor(2, { x: 5, z: 6, vx: 20, distance: 900, laps: 2 })]));
        s.onSnapshot(snapBuf(2, 1, 40.9, [carFor(2, { x: 7, z: 6, vx: 20, distance: 902, laps: 2, qy: 0.6, qw: 0.8 })]));
        now.mockReturnValue(41050);
        // The pose the car is being drawn at right now: where it carries on from, so it never jumps.
        const pose = { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, vx: 0, vy: 0, vz: 0 };
        car.remote!.buffer.sample(car.remote!.buffer.renderTimeAt(s.now()), pose);
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        s.adopt([2]);

        expect(car.kind).toBe('ai');
        expect(car.remote).toBeNull();
        expect(car.owner).toBe(1);
        expect(car.isPlayer).toBe(false);
        // A fresh skill in the bot range, rolled on this phone.
        expect(car.ai!.skill).toBeCloseTo(0.925);
        expect(car.ai!.lane).toBe(car.progress.lateral);
        const b = mocks(car);
        // Dynamic (0) from now on: our physics drives it.
        expect(b.setBodyType).toHaveBeenCalledWith(0, true);
        expect(b.setTranslation).toHaveBeenCalledWith({ x: pose.x, y: pose.y, z: pose.z }, true);
        expect(b.setRotation).toHaveBeenCalledWith({ x: pose.qx, y: pose.qy, z: pose.qz, w: pose.qw }, true);
        expect(b.setLinvel).toHaveBeenCalledWith({ x: pose.vx, y: pose.vy, z: pose.vz }, true);
        // Distance and laps carry on from the last snapshot. The clock so far is shared by distance (400 m laps):
        // each lap done at the average pace, and this lap started as long ago as its 102 m took at that pace.
        expect(car.progress.distance).toBeCloseTo(902);
        expect(car.progress.lapsDone).toBe(2);
        const per = 41.05 * 400 / 902;
        expect(car.progress.lapTimes).toHaveLength(2);
        expect(car.progress.lapTimes[0]).toBeCloseTo(per);
        expect(car.progress.lapTimes[1]).toBeCloseTo(per);
        expect(car.progress.lapStart).toBeCloseTo(41.05 - (102 / 400) * per);
        // Laps done plus this lap so far add up to the clock.
        expect(per * 2 + (41.05 - car.progress.lapStart)).toBeCloseTo(41.05);
      });

      it('ignores cars this phone already drives and unknown netIds, and a repeat adopt changes nothing', () => {
        const { s, racers } = started(1000);
        const before = racers[1].ai;
        s.adopt([1, 9]);
        expect(racers[1].ai).toBe(before);
        expect(racers[0].kind).toBe('local');
        s.adopt([2]);
        const ai = racers[2].ai;
        mocks(racers[2]).setTranslation.mockClear();
        s.adopt([2]);
        expect(racers[2].ai).toBe(ai);
        expect(mocks(racers[2]).setTranslation).not.toHaveBeenCalled();
      });

      it('with nothing heard from the car yet, leaves it where it stands', () => {
        const { s, racers } = started(1000);
        s.adopt([2]);
        expect(racers[2].kind).toBe('ai');
        expect(mocks(racers[2]).setTranslation).not.toHaveBeenCalled();
        expect(mocks(racers[2]).setBodyType).toHaveBeenCalledWith(0, true);
      });

      it('a bot adopted 80% through lap 2 finishes with a claim the referee accepts', () => {
        // The real thing: a 3-lap race on the test loop, an okada at 90% of its top speed all the way round.
        const LAPS = 3, L = track.length, v = vehicleById('okada').tuning.topSpeed * 0.9, start = -8;
        const grid = [{ netId: 0, slot: 2, name: 'Kunle', vehicle: 'okada' as const, paint: 'red', ai: true }];
        const referee = new Referee(track, LAPS, grid);
        const at = (d: number) => sampleAt(track, ((d % L) + L) % L).pos;
        const distAt = (time: number) => start + v * time;
        // The old owner's snapshots reach the referee (once a second) until the handover.
        const handover = (1.8 * L - start) / v;
        const observe = (time: number) => {
          const p = at(distAt(time));
          referee.observe({ netId: 0, x: p.x, y: p.y, z: p.z, qx: 0, qy: 0, qz: 0, qw: 1, vx: v, vy: 0, vz: 0, distance: distAt(time), laps: Math.max(0, Math.floor(distAt(time) / L)), flags: 0 }, time);
        };
        for (let time = 0; time < handover; time += 1) observe(time);

        const now = vi.spyOn(performance, 'now').mockReturnValue(handover * 1000);
        const s = new NetSession(fakeLink().link, clockAhead(), setup);
        s.setStart(10000);
        const p0 = at(distAt(handover));
        const car = makeRacer(0, 'Kunle', vehicleById('okada'), vehicleById('okada').paints[0], false, createProgress(track, p0.x, p0.z));
        car.kind = 'remote'; car.owner = 2; car.remote = { buffer: new SnapshotBuffer(), dnf: false };
        car.progress.distance = distAt(handover);
        car.progress.lapsDone = 1;
        s.attach({ racers: [car], net: null, track } as unknown as RaceRuntime);
        s.adopt([0]);
        expect(car.kind).toBe('ai');

        // This phone drives the rest, counting laps as RaceLogic does, and the referee keeps hearing its snapshots.
        let finished = false, time = handover;
        while (!finished && time < handover + 200) {
          time += 1 / 60;
          const p = at(distAt(time));
          finished = !!updateProgress(track, car.progress, p.x, p.z, time, LAPS)?.finished;
          if (Math.floor(time) !== Math.floor(time - 1 / 60)) observe(time);
        }
        expect(finished).toBe(true);
        observe(car.progress.finishTime!);
        now.mockRestore();
        // Every lap no quicker than the referee's fastest believable lap, and the claim is accepted.
        const minLap = L / (vehicleById('okada').tuning.topSpeed * 1.6);
        expect(car.progress.lapTimes).toHaveLength(LAPS);
        expect(Math.min(...car.progress.lapTimes)).toBeGreaterThanOrEqual(minLap);
        expect(referee.finish(0, [...car.progress.lapTimes], car.progress.finishTime!, car.progress.finishTime! + 0.1)).toBe(true);
      });

      it('adopt before attach applies on attach', () => {
        const s = new NetSession(fakeLink().link, clockAhead(), setup);
        s.adopt([2]);
        const car = racer(2, 'remote', 2);
        // During loading the car's body is not built yet; the scene switches it when it is.
        car.body = null;
        s.attach({ racers: [racer(0, 'local', 1), car], net: null } as unknown as RaceRuntime);
        expect(car.kind).toBe('ai');
        expect(car.remote).toBeNull();
        expect(car.owner).toBe(1);
        expect(car.ai!.skill).toBeGreaterThanOrEqual(0.85);
        expect(car.ai!.skill).toBeLessThanOrEqual(1);
      });

      it("adopted car's snapshots are now sent by this phone", () => {
        const { s, race, racers, binary } = started(1000);
        s.adopt([2]);
        s.update(race);
        expect(decodeSnapshot(binary[0])!.cars.map(c => c.netId)).toEqual([0, 1, 2]);
        // The old owner's last snapshots, still in flight, no longer move it.
        s.onSnapshot(snapBuf(2, 1, 0.95, [carFor(2, { distance: 500 })]));
        expect(racers[2].progress.distance).toBe(0);
      });
    });

    it('drops snapshots from another raceSeq or from my own slot', () => {
      const { s, racers } = started(1000);
      s.onSnapshot(snapBuf(2, 2, 0.9, [carFor(2, { distance: 50 })]));
      s.onSnapshot(snapBuf(1, 1, 0.9, [carFor(2, { distance: 60 })]));
      s.onSnapshot(new ArrayBuffer(3));
      expect(racers[2].progress.distance).toBe(0);
      expect(racers[2].remote!.buffer.latest()).toBeNull();
    });
  });
});
