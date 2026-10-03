import { describe, expect, it } from 'vitest';
import { Euler, Quaternion } from 'three';
import { SnapshotBuffer, type Pose } from './interpolation';
import type { CarState } from './protocol';

const car = (o: Partial<CarState> = {}): CarState => ({
  netId: 0, x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, vx: 0, vy: 0, vz: 0, distance: 0, laps: 0, flags: 0, ...o,
});
const pose = (): Pose => ({ x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, vx: 0, vy: 0, vz: 0 });

describe('SnapshotBuffer', () => {
  it('returns empty before any snapshot', () => {
    const b = new SnapshotBuffer();
    expect(b.sample(1, pose())).toBe('empty');
    expect(b.latest()).toBeNull();
  });

  it('interpolates position and velocity halfway between two snapshots', () => {
    const b = new SnapshotBuffer();
    b.push(car({ x: 0, vx: 0 }), 1, 1.1);
    b.push(car({ x: 10, vx: 20 }), 2, 2.1);
    const out = pose();
    expect(b.sample(1.5, out)).toBe('interp');
    expect(out.x).toBeCloseTo(5);
    expect(out.vx).toBeCloseTo(10);
  });

  it('slerps rotation', () => {
    const b = new SnapshotBuffer();
    const q = new Quaternion().setFromEuler(new Euler(0, Math.PI / 2, 0));
    b.push(car(), 1, 1.1);
    b.push(car({ qx: q.x, qy: q.y, qz: q.z, qw: q.w }), 2, 2.1);
    const out = pose();
    b.sample(1.5, out);
    const yaw = new Euler().setFromQuaternion(new Quaternion(out.qx, out.qy, out.qz, out.qw), 'YXZ').y;
    expect(Math.abs((yaw * 180) / Math.PI - 45)).toBeLessThan(0.5);
  });

  it('extrapolates up to 0.25 s then holds', () => {
    const b = new SnapshotBuffer();
    b.push(car({ x: 0 }), 1, 1.1);
    b.push(car({ x: 10, vx: 20 }), 2, 2.1);
    const out = pose();
    expect(b.sample(2.1, out)).toBe('extrap');
    expect(out.x).toBeCloseTo(12);
    expect(b.sample(2.5, out)).toBe('hold');
    expect(out.x).toBeCloseTo(15);
  });

  it('holds the oldest pose before the first snapshot, and tolerates time stepping backwards', () => {
    const b = new SnapshotBuffer();
    b.push(car({ x: 3 }), 1, 1.1);
    b.push(car({ x: 10 }), 2, 2.1);
    const out = pose();
    expect(b.sample(0.5, out)).toBe('hold');
    expect(out.x).toBeCloseTo(3);
    b.sample(1.8, out);
    expect(b.sample(1.79, out)).toBe('interp');
    expect(out.x).toBeCloseTo(3 + 7 * 0.79);
  });

  it('ignores snapshots that are not newer than the newest', () => {
    const b = new SnapshotBuffer();
    b.push(car({ x: 10 }), 2, 2.1);
    b.push(car({ x: 99 }), 2, 2.2);
    b.push(car({ x: 98 }), 1, 2.3);
    expect(b.latest()?.x).toBe(10);
    const out = pose();
    b.sample(2, out);
    expect(out.x).toBeCloseTo(10);
  });

  it('keeps only the newest 32 entries', () => {
    const b = new SnapshotBuffer();
    for (let i = 0; i < 40; i++) b.push(car({ x: i }), i, i);
    const out = pose();
    expect(b.sample(7, out)).toBe('hold'); // oldest kept is t=8
    expect(out.x).toBeCloseTo(8);
    expect(b.sample(8.5, out)).toBe('interp');
  });

  it('delay is median lateness plus a 0.1-0.25 s cushion', () => {
    const steady = new SnapshotBuffer();
    for (let i = 0; i < 30; i++) steady.push(car(), i / 15, i / 15 + 0.08);
    expect(steady.delay).toBeCloseTo(0.18);
    expect(steady.renderTimeAt(10)).toBeCloseTo(10 - 0.18);

    const jittery = new SnapshotBuffer();
    for (let i = 0; i < 30; i++) jittery.push(car(), i / 15, i / 15 + (i % 2 ? 0.25 : 0.05));
    expect(jittery.delay).toBeCloseTo(0.4);
  });

  it('accepts negative lateness as data', () => {
    const b = new SnapshotBuffer();
    for (let i = 0; i < 10; i++) b.push(car(), i / 15, i / 15 - 0.02);
    expect(b.delay).toBeCloseTo(-0.02 + 0.1);
  });
});
