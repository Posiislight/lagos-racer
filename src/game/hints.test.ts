import { describe, expect, it } from 'vitest';
import { itemHint } from './hints';

describe('itemHint', () => {
  it('tells keyboard players to press Space, with what the item does', () => {
    expect(itemHint('juju', 'keys', 0)).toBe('JUJU! Press Space to throw it at the racer ahead');
    expect(itemHint('oil', 'keys', 1)).toBe('CRUDE OIL! Press Space to drop it behind you');
  });

  it('tells phone players to tap USE', () => {
    expect(itemHint('fuel', 'touch', 2)).toBe('FUEL! Tap USE for a speed boost');
  });

  it('explains the odeshi shield too', () => {
    expect(itemHint('odeshi', 'keys', 0)).toBe('ODESHI! Press Space to block juju and crude oil for a while');
  });

  it('just names the item after the first three pickups', () => {
    expect(itemHint('juju', 'touch', 3)).toBe('JUJU!');
    expect(itemHint('fuel', 'keys', 10)).toBe('FUEL!');
  });
});
