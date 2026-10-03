import { afterEach, describe, expect, it, vi } from 'vitest';
import { FLAG, decodeSnapshot, encodeSnapshot, type CarState, type ClientMessage } from './protocol';
import type { RaceRuntime, Racer } from '../game/runtime';
import { makeRacer } from '../game/runtime';
import { vehicleById } from '../config/vehicles';
import { SnapshotBuffer } from './interpolation';
import { ClockSync } from './clock';
import type { NetLink } from './connection';
import { NetSession } from './session';

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

const setup = { grid: [], mySlot: 1, seed: 7, raceSeq: 1 };

describe('NetSession', () => {
  afterEach(() => vi.restoreAllMocks());

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
    }) as unknown as Racer['body'];

    function racer(id: number, kind: Racer['kind'], owner: number): Racer {
      const r = makeRacer(id, `r${id}`, vehicleById('okada'), kind === 'local', progress());
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
      const s = new NetSession(link, clockAhead(), setup);
      const racers = [racer(0, 'local', 1), racer(1, 'ai', 1), racer(2, 'remote', 2)];
      const race = { racers, net: null } as unknown as RaceRuntime;
      s.attach(race);
      // Server time is ms + 10000; a start at 10000 puts now() at ms / 1000.
      s.setStart(10000);
      return { s, race, racers, binary, sent, now };
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
