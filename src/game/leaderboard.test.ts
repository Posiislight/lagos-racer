import { describe, expect, it } from 'vitest';
import { entriesFromResults, mergeBoard, playerKey, pointsFor, weekStart, type Row } from './leaderboard';
import type { NetResult } from '../net/protocol';

const result = (over: Partial<NetResult>): NetResult => ({
  netId: 1, slot: 0, ai: false, name: 'Odogwu', vehicle: 'okada', paint: 'yellow', place: 1, time: 80, projected: false, best: 26, dnf: false, ...over,
});

describe('playerKey', () => {
  it('trims, lower-cases and collapses spaces', () => {
    expect(playerKey('  Odogwu   RIDER ')).toBe('odogwu rider');
  });
  it('is empty when nothing usable is left', () => {
    expect(playerKey('   ')).toBe('');
    expect(playerKey('\u0007\u0000')).toBe('');
  });
});

describe('weekStart', () => {
  it('starts the week on Monday 00:00 Lagos time', () => {
    expect(weekStart(Date.UTC(2026, 9, 4, 23, 30))).toBe('2026-10-05');
    expect(weekStart(Date.UTC(2026, 9, 4, 22, 30))).toBe('2026-09-28');
  });
});

describe('pointsFor', () => {
  it('pays the placeholder scale and nothing below sixth', () => {
    expect(pointsFor(1)).toBe(10);
    expect(pointsFor(2)).toBe(7);
    expect(pointsFor(6)).toBe(1);
    expect(pointsFor(7)).toBe(0);
  });
});

describe('entriesFromResults', () => {
  it('skips bots, DNFs, unfinished and timeless results', () => {
    const out = entriesFromResults([
      result({ netId: 1, name: 'Real', place: 1 }),
      result({ netId: 2, name: 'Bot', ai: true, place: 2 }),
      result({ netId: 3, name: 'Quit', dnf: true, place: 3 }),
      result({ netId: 4, name: 'Still going', projected: true, place: 4 }),
      result({ netId: 5, name: 'No time', time: null, place: 5 }),
    ]);
    expect(out.map(e => e.name)).toEqual(['Real']);
  });
  it('turns seconds into milliseconds and place into points', () => {
    const [e] = entriesFromResults([result({ name: 'Ada', time: 83.4126, place: 2 })]);
    expect(e).toEqual({ key: 'ada', name: 'Ada', vehicle: 'okada', timeMs: 83413, points: 7 });
  });
  it('keeps one entry per key, the better place', () => {
    const out = entriesFromResults([
      result({ netId: 1, name: 'Ada', place: 3, time: 90 }),
      result({ netId: 2, name: 'ada ', place: 1, time: 85 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].points).toBe(10);
    expect(out[0].timeMs).toBe(85000);
  });
  it('skips a nickname with no usable key', () => {
    expect(entriesFromResults([result({ name: '   ' })])).toEqual([]);
  });
});

describe('mergeBoard', () => {
  const row = (i: number, seed: boolean, value = i): Row => ({ key: `k${i}${seed ? 's' : ''}`, name: `N${i}`, value, seed });
  it('keeps seeds below 20 real rows and drops them from 20', () => {
    const seeds = Array.from({ length: 5 }, (_, i) => row(100 + i, true));
    const few = Array.from({ length: 19 }, (_, i) => row(i, false));
    const many = Array.from({ length: 20 }, (_, i) => row(i, false));
    expect(mergeBoard([...few, ...seeds], 'asc').filter(r => r.seed)).toHaveLength(5);
    expect(mergeBoard([...many, ...seeds], 'asc').filter(r => r.seed)).toHaveLength(0);
  });
  it('sorts by the order asked and cuts to the limit', () => {
    const rows = [row(1, false, 30), row(2, false, 10), row(3, false, 20)];
    expect(mergeBoard(rows, 'asc').map(r => r.value)).toEqual([10, 20, 30]);
    expect(mergeBoard(rows, 'desc').map(r => r.value)).toEqual([30, 20, 10]);
    expect(mergeBoard(rows, 'desc', 2)).toHaveLength(2);
    expect(mergeBoard(Array.from({ length: 80 }, (_, i) => row(i, false)), 'asc')).toHaveLength(50);
  });
});
