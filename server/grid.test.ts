import { describe, expect, it } from 'vitest';
import { buildGrid, buildQuickGrid } from './grid';
import { AI_NAMES } from '../src/game/names';

const rnd = () => {
  let seed = 11;
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
};

describe('buildGrid', () => {
  it('orders humans by slot and numbers netIds from 0', () => {
    const grid = buildGrid([
      { slot: 4, name: 'Dayo', vehicle: 'danfo', paint: 'red' },
      { slot: 1, name: 'Ade', vehicle: 'okada', paint: 'red' },
      { slot: 2, name: 'Bola', vehicle: 'keke', paint: 'red' },
    ], false, 1, rnd());
    expect(grid).toEqual([
      { netId: 0, slot: 1, name: 'Ade', vehicle: 'okada', paint: 'red', ai: false },
      { netId: 1, slot: 2, name: 'Bola', vehicle: 'keke', paint: 'red', ai: false },
      { netId: 2, slot: 4, name: 'Dayo', vehicle: 'danfo', paint: 'red', ai: false },
    ]);
  });

  it('does not reorder its input', () => {
    const input = [
      { slot: 3, name: 'C', vehicle: 'okada' as const, paint: 'red' },
      { slot: 1, name: 'A', vehicle: 'okada' as const, paint: 'red' },
    ];
    buildGrid(input, false, 1, rnd());
    expect(input.map(m => m.slot)).toEqual([3, 1]);
  });

  const humans = [
    { slot: 1, name: 'Ade', vehicle: 'okada' as const, paint: 'red' },
    { slot: 2, name: 'Bola', vehicle: 'keke' as const, paint: 'yellow' },
  ];

  it('humans only when fillAI is false', () => {
    expect(buildGrid(humans, false, 1, rnd()).every(e => !e.ai)).toBe(true);
    expect(buildGrid(humans, false, 1, rnd())).toHaveLength(2);
  });

  it('fills to 6 with AI at the front, owned by the host, with distinct names', () => {
    const grid = buildGrid(humans, true, 2, rnd());
    expect(grid).toHaveLength(6);
    expect(grid.map(e => e.netId)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(grid.map(e => e.ai)).toEqual([true, true, true, true, false, false]);
    expect(grid.slice(0, 4).every(e => e.slot === 2)).toBe(true);
    expect(grid.slice(4).map(e => e.slot)).toEqual([1, 2]);
    const names = grid.slice(0, 4).map(e => e.name);
    expect(new Set(names).size).toBe(4);
    expect(names.every(n => AI_NAMES.includes(n))).toBe(true);
  });

  it('AI prefers vehicles no human picked', () => {
    const grid = buildGrid(humans, true, 1, rnd());
    const ai = grid.filter(e => e.ai).map(e => e.vehicle);
    // Unused rides first, then the humans' rides again in a paint nobody has.
    expect(ai).toEqual(['danfo', 'brt', 'okada', 'keke']);
    const keys = grid.map(e => `${e.vehicle}/${e.paint}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('adds nothing when the grid is already full', () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ slot: i + 1, name: `P${i}`, vehicle: 'okada' as const, paint: 'red' }));
    expect(buildGrid(six, true, 1, rnd()).every(e => !e.ai)).toBe(true);
  });
});

describe('buildQuickGrid', () => {
  it('buildQuickGrid puts bots in front owned by the owner, ai true, humans after', () => {
    const bots = [
      { slot: 7, name: 'Tunde', vehicle: 'danfo' as const, paint: 'red' },
      { slot: 9, name: 'Femi99', vehicle: 'brt' as const, paint: 'white' },
    ];
    const grid = buildQuickGrid(
      [
        { slot: 3, name: 'Chidi', vehicle: 'keke', paint: 'yellow' },
        { slot: 2, name: 'Bola', vehicle: 'okada', paint: 'red' },
      ],
      bots,
      2,
    );
    expect(grid).toEqual([
      { netId: 0, slot: 2, name: 'Tunde', vehicle: 'danfo', paint: 'red', ai: true },
      { netId: 1, slot: 2, name: 'Femi99', vehicle: 'brt', paint: 'white', ai: true },
      { netId: 2, slot: 2, name: 'Bola', vehicle: 'okada', paint: 'red', ai: false },
      { netId: 3, slot: 3, name: 'Chidi', vehicle: 'keke', paint: 'yellow', ai: false },
    ]);
  });
});
