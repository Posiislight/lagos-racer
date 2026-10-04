import { describe, expect, it } from 'vitest';
import type { NetResult } from './protocol';
import { coinsFor, toResults } from './results';

const row = (over: Partial<NetResult>): NetResult => ({
  netId: 0, slot: 1, ai: false, name: 'Ade', vehicle: 'okada', paint: 'red', place: 1, time: 90.5, projected: false, best: 29.8, dnf: false, ...over,
});

describe('toResults', () => {
  it('marks only my slot as the player even when another player has the same name and vehicle', () => {
    const net = [
      row({ netId: 0, slot: 1, place: 1 }),
      row({ netId: 1, slot: 2, place: 2, time: 92 }),
      // An AI the same phone drives is never "me".
      row({ netId: 2, slot: 2, ai: true, name: 'Odogwu', place: 3, time: 95, projected: true, best: null }),
    ];
    expect(toResults(net, 2)).toEqual([
      { name: 'Ade', vehicle: 'okada', color: '#d0141a', time: 90.5, projected: false, best: 29.8, isPlayer: false, dnf: false },
      { name: 'Ade', vehicle: 'okada', color: '#d0141a', time: 92, projected: false, best: 29.8, isPlayer: true, dnf: false },
      { name: 'Odogwu', vehicle: 'okada', color: '#d0141a', time: 95, projected: true, best: null, isPlayer: false, dnf: false },
    ]);
  });

  it('maps DNF to time null', () => {
    const [r] = toResults([row({ dnf: true, time: 61, projected: false })], 1);
    expect(r).toMatchObject({ time: null, isPlayer: true, dnf: true });
  });

  it('lists results in place order', () => {
    const net = [row({ netId: 1, slot: 2, name: 'Bola', place: 2 }), row({ netId: 0, place: 1 })];
    expect(toResults(net, 1).map(r => r.name)).toEqual(['Ade', 'Bola']);
  });

  it('pays coins by place, but a flat 20 for a DNF wherever it ranks', () => {
    expect([1, 2, 3, 4, 5].map(place => coinsFor(row({ place })))).toEqual([150, 100, 60, 30, 20]);
    expect(coinsFor(row({ place: 1, dnf: true, time: null }))).toBe(20);
    expect(coinsFor(row({ place: 2, dnf: true, time: null }))).toBe(20);
  });
});
