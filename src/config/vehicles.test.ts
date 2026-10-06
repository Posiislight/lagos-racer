import { describe, expect, it } from 'vitest';
import { VEHICLES, ownsPaint, paintKey, paintPrice, vehicleById } from './vehicles';
import { PAINT_PRICE } from './premium';

describe('paints', () => {
  it('every vehicle but the BRT starts yellow', () => {
    for (const id of ['okada', 'keke', 'danfo'] as const) expect(vehicleById(id).paints[0].name).toBe('Yellow');
    expect(vehicleById('brt').paints[0].name).toBe('Blue');
  });

  it('keeps six paints each, all with distinct ids', () => {
    for (const v of VEHICLES) {
      expect(v.paints).toHaveLength(6);
      expect(new Set(v.paints.map(p => p.id)).size).toBe(6);
    }
  });

  it('the default paint is free and owned, others cost PAINT_PRICE', () => {
    const okada = vehicleById('okada');
    expect(paintPrice(okada, okada.paints[0].id)).toBe(0);
    expect(paintPrice(okada, 'red')).toBe(PAINT_PRICE);
    expect(ownsPaint([], okada, okada.paints[0].id)).toBe(true);
    expect(ownsPaint([], okada, 'red')).toBe(false);
    expect(ownsPaint([paintKey('okada', 'red')], okada, 'red')).toBe(true);
  });
});

describe('BRT lock', () => {
  it('unlocks by ads or premium, not naira', () => {
    expect(vehicleById('brt').locked).toEqual({ naira: 1_000_000, ads: 1 });
    for (const id of ['okada', 'keke', 'danfo'] as const) expect(vehicleById(id).locked).toBeUndefined();
  });
});
