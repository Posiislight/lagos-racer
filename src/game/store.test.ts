import { beforeEach, describe, expect, it } from 'vitest';
import { useGame } from './store';

const reset = (coins: number) => useGame.setState({ coins, unlocked: [], upgrades: {} });
const state = () => useGame.getState();

describe('buyUpgrade', () => {
  beforeEach(() => reset(0));

  it('charges the level price and raises the level', () => {
    reset(100_000);
    expect(state().buyUpgrade('okada', 'engine')).toBe(true);
    expect(state().coins).toBe(20_000);
    expect(state().upgrades.okada?.engine).toBe(1);
  });

  it('does nothing when the player is short of naira', () => {
    reset(79_999);
    expect(state().buyUpgrade('okada', 'engine')).toBe(false);
    expect(state().coins).toBe(79_999);
    expect(state().upgrades.okada).toBeUndefined();
  });

  it('does nothing at level 5', () => {
    useGame.setState({ coins: 10_000_000, unlocked: [], upgrades: { okada: { engine: 5, tyres: 0, body: 0 } } });
    expect(state().buyUpgrade('okada', 'engine')).toBe(false);
    expect(state().coins).toBe(10_000_000);
    expect(state().upgrades.okada?.engine).toBe(5);
  });

  it('does nothing for a vehicle that is still locked, then works once it is unlocked', () => {
    reset(10_000_000);
    expect(state().buyUpgrade('brt-blue', 'body')).toBe(false);
    expect(state().coins).toBe(10_000_000);
    useGame.setState({ unlocked: ['brt-blue'] });
    expect(state().buyUpgrade('brt-blue', 'body')).toBe(true);
    expect(state().upgrades['brt-blue']?.body).toBe(1);
  });

  it('buys once when a second tap arrives with money for only one', () => {
    reset(100_000);
    expect(state().buyUpgrade('okada', 'engine')).toBe(true);
    expect(state().buyUpgrade('okada', 'engine')).toBe(false);
    expect(state().upgrades.okada?.engine).toBe(1);
    expect(state().coins).toBe(20_000);
  });

  it('keeps each vehicle\'s upgrades separate', () => {
    reset(500_000);
    state().buyUpgrade('okada', 'engine');
    expect(state().upgrades['okada-blue']).toBeUndefined();
  });
});

describe('unlock', () => {
  it('costs the rescaled price', () => {
    reset(1_999_999);
    state().unlock('brt-blue');
    expect(state().unlocked).not.toContain('brt-blue');
    reset(2_000_000);
    state().unlock('brt-blue');
    expect(state().unlocked).toContain('brt-blue');
    expect(state().coins).toBe(0);
  });
});
