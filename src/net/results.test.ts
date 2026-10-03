import { describe, expect, it } from 'vitest';
import type { NetResult } from './protocol';
import { toResults } from './results';

const row = (over: Partial<NetResult>): NetResult => ({
  netId: 0, slot: 1, ai: false, name: 'Ade', vehicle: 'okada', place: 1, time: 90.5, projected: false, best: 29.8, dnf: false, ...over,
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
      { name: 'Ade', vehicle: 'okada', time: 90.5, projected: false, best: 29.8, isPlayer: false },
      { name: 'Ade', vehicle: 'okada', time: 92, projected: false, best: 29.8, isPlayer: true },
      { name: 'Odogwu', vehicle: 'okada', time: 95, projected: true, best: null, isPlayer: false },
    ]);
  });

  it('maps DNF to time null', () => {
    const [r] = toResults([row({ dnf: true, time: 61, projected: false })], 1);
    expect(r).toMatchObject({ time: null, isPlayer: true });
  });

  it('lists results in place order', () => {
    const net = [row({ netId: 1, slot: 2, name: 'Bola', place: 2 }), row({ netId: 0, place: 1 })];
    expect(toResults(net, 1).map(r => r.name)).toEqual(['Ade', 'Bola']);
  });
});
