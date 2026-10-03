import { describe, expect, it } from 'vitest';
import { buildGrid } from './grid';

describe('buildGrid', () => {
  it('orders humans by slot and numbers netIds from 0', () => {
    const grid = buildGrid([
      { slot: 4, name: 'Dayo', vehicle: 'danfo' },
      { slot: 1, name: 'Ade', vehicle: 'okada' },
      { slot: 2, name: 'Bola', vehicle: 'keke' },
    ]);
    expect(grid).toEqual([
      { netId: 0, slot: 1, name: 'Ade', vehicle: 'okada', ai: false },
      { netId: 1, slot: 2, name: 'Bola', vehicle: 'keke', ai: false },
      { netId: 2, slot: 4, name: 'Dayo', vehicle: 'danfo', ai: false },
    ]);
  });

  it('does not reorder its input', () => {
    const input = [
      { slot: 3, name: 'C', vehicle: 'okada' as const },
      { slot: 1, name: 'A', vehicle: 'okada' as const },
    ];
    buildGrid(input);
    expect(input.map(m => m.slot)).toEqual([3, 1]);
  });
});
