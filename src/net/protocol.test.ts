import { describe, expect, it } from 'vitest';
import { BOT_SLOT_BASE, FLAG, MAX_HUMANS, MAX_QUICK_ROOMS, QUICK_WAIT_MS, cleanNick, decodeSnapshot, encodeSnapshot, normalizeCode, type Snapshot } from './protocol';

const yaw30 = { qx: 0, qy: Math.sin(Math.PI / 12), qz: 0, qw: Math.cos(Math.PI / 12) };

const snapshot = (over: Partial<Snapshot> = {}): Snapshot => ({
  slot: 2,
  raceSeq: 7,
  time: 41.5,
  cars: [
    { netId: 3, x: 12.5, y: 1.25, z: -40, ...yaw30, vx: 31.4, vy: -0.5, vz: -12.2, distance: 812.75, laps: 1, flags: FLAG.boost | FLAG.horn },
    { netId: 0, x: -3, y: 0.5, z: 8.25, qx: 0, qy: 0, qz: 0, qw: 1, vx: 0, vy: 0, vz: 0, distance: 20, laps: 0, flags: 0 },
  ],
  ...over,
});

describe('snapshots', () => {
  it('round-trips a two-car snapshot within quantisation error', () => {
    const s = snapshot();
    const buf = encodeSnapshot(s);
    const out = decodeSnapshot(buf)!;
    expect(out.slot).toBe(2);
    expect(out.raceSeq).toBe(7);
    expect(out.time).toBeCloseTo(41.5, 4);
    expect(out.cars).toHaveLength(2);
    expect(out.cars[0].netId).toBe(3);
    expect(out.cars[0].x).toBeCloseTo(12.5, 4);
    expect(out.cars[0].z).toBeCloseTo(-40, 4);
    expect(out.cars[0].qy).toBeCloseTo(s.cars[0].qy, 4);
    expect(out.cars[0].qw).toBeCloseTo(s.cars[0].qw, 4);
    expect(out.cars[0].vx).toBeCloseTo(31.4, 2);
    expect(out.cars[0].vz).toBeCloseTo(-12.2, 2);
    expect(out.cars[0].distance).toBeCloseTo(812.75, 4);
    expect(out.cars[0].laps).toBe(1);
    expect(out.cars[0].flags).toBe(FLAG.boost | FLAG.horn);
    expect(out.cars[1].netId).toBe(0);
    expect(buf.byteLength).toBe(8 + 2 * 33);
  });

  it('rejects a wrong version or a truncated buffer', () => {
    const buf = encodeSnapshot(snapshot());
    const wrongVersion = buf.slice(0);
    new DataView(wrongVersion).setUint8(0, 2);
    expect(decodeSnapshot(wrongVersion)).toBeNull();
    expect(decodeSnapshot(buf.slice(0, buf.byteLength - 1))).toBeNull();
    expect(decodeSnapshot(buf.slice(0, 4))).toBeNull();
  });

  it('wraps raceSeq above 255', () => {
    expect(decodeSnapshot(encodeSnapshot(snapshot({ raceSeq: 257 })))!.raceSeq).toBe(1);
  });

  it('clamps velocity to the i16 cm/s range', () => {
    const s = snapshot();
    s.cars[0].vx = 900;
    s.cars[0].vz = -900;
    const out = decodeSnapshot(encodeSnapshot(s))!;
    expect(out.cars[0].vx).toBeCloseTo(327.67, 2);
    expect(out.cars[0].vz).toBeCloseTo(-327.68, 2);
  });
});

describe('room codes and nicknames', () => {
  it('normalizes " keke " to "KEKE"', () => expect(normalizeCode(' keke ')).toBe('KEKE'));

  it('cleans nicknames', () => {
    expect(cleanNick('  Tunde  ')).toBe('Tunde');
    expect(cleanNick('a\u0007b')).toBe('ab');
    expect(cleanNick('   ')).toBeNull();
    expect(cleanNick('x'.repeat(30))).toHaveLength(16);
  });
});

describe('quick race', () => {
  it('quick constants match the spec', () => {
    expect(QUICK_WAIT_MS).toBe(30000);
    expect(MAX_QUICK_ROOMS).toBe(50);
    expect(BOT_SLOT_BASE).toBe(7);
    expect(BOT_SLOT_BASE).toBeGreaterThan(MAX_HUMANS);
  });
});
