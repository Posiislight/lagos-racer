import { beforeEach, describe, expect, it } from 'vitest';
import { CHAPTER_1 } from '../config/campaign';
import { useGame } from './store';

const [r1, , , duel] = CHAPTER_1;
const state = () => useGame.getState();

beforeEach(() => {
  useGame.setState({ coins: 0, coinsEarned: 0, campaign: { cleared: [] }, driver: 'moshood', spec: null, outcome: null, best: {}, track: 'ojuelegba' });
});

describe('startRace', () => {
  it('goes to the race screen with the chosen spec, or none for a quick race', () => {
    state().startRace(r1);
    expect(state().screen).toBe('race');
    expect(state().spec).toBe(r1);
    state().startRace();
    expect(state().spec).toBeNull();
  });
});

describe('finishRace', () => {
  it('pays and records the first clear, then only place coins', () => {
    state().startRace(r1);
    state().finishRace([], 2, null);
    expect(state().coins).toBe(200);
    expect(state().coinsEarned).toBe(200);
    expect(state().campaign.cleared).toEqual(['campaign-1-1']);
    expect(state().outcome).toEqual({ place: 2, passed: true, firstClear: true, unlocked: null });
    state().startRace(r1);
    state().finishRace([], 2, null);
    expect(state().coins).toBe(300);
    expect(state().campaign.cleared).toHaveLength(1);
    expect(state().outcome?.firstClear).toBe(false);
  });

  it('a lost duel unlocks nothing; a won duel unlocks Mama Put', () => {
    state().startRace(duel);
    state().finishRace([], 2, null);
    expect(state().coins).toBe(40);
    expect(state().campaign.cleared).toEqual([]);
    expect(state().outcome?.unlocked).toBeNull();
    state().startRace(duel);
    state().finishRace([], 1, null);
    expect(state().coins).toBe(540);
    expect(state().campaign.cleared).toContain('campaign-1-4');
    expect(state().outcome?.unlocked).toBe('mamaput');
  });

  it('a quick race pays place coins, has no outcome and clears nothing', () => {
    state().startRace();
    state().finishRace([], 1, null);
    expect(state().coins).toBe(150);
    expect(state().outcome).toBeNull();
    expect(state().campaign.cleared).toEqual([]);
  });

  it('files the best lap under the track the race was run on', () => {
    state().startRace(CHAPTER_1[1]);
    state().finishRace([], 1, 70);
    expect(state().best).toEqual({ 'third-mainland': 70 });
  });
});

describe('setDriver', () => {
  it('ignores a locked driver until the duel is cleared', () => {
    state().setDriver('mamaput');
    expect(state().driver).toBe('moshood');
    useGame.setState({ campaign: { cleared: ['campaign-1-4'] } });
    state().setDriver('mamaput');
    expect(state().driver).toBe('mamaput');
  });
});

describe('premium currency', () => {
  beforeEach(() => {
    useGame.setState({ premium: 0, ownedPaints: [], adViews: {}, unlocked: [], paint: {}, vehicle: 'okada' });
  });

  it('buyPaint pays once and selects the paint', () => {
    useGame.setState({ premium: 150 });
    expect(state().buyPaint('okada', 'red')).toBe(true);
    expect(state().premium).toBe(50);
    expect(state().ownedPaints).toContain('okada/red');
    expect(state().paint.okada).toBe('red');
    expect(state().buyPaint('okada', 'red')).toBe(false);
    expect(state().premium).toBe(50);
  });

  it('buyPaint does nothing when short, for the free paint, or for an unknown paint', () => {
    useGame.setState({ premium: 99 });
    expect(state().buyPaint('okada', 'red')).toBe(false);
    expect(state().premium).toBe(99);
    useGame.setState({ premium: 500 });
    expect(state().buyPaint('okada', 'yellow')).toBe(false);
    expect(state().buyPaint('okada', 'nope')).toBe(false);
    expect(state().premium).toBe(500);
  });

  it('setPaint refuses a paint that is not owned', () => {
    state().setPaint('okada', 'red');
    expect(state().paint.okada).toBeUndefined();
    useGame.setState({ premium: 100 });
    state().buyPaint('okada', 'red');
    state().setPaint('okada', 'yellow');
    expect(state().paint.okada).toBe('yellow');
    state().setPaint('okada', 'red');
    expect(state().paint.okada).toBe('red');
  });

  it('unlock pays the BRT price in premium currency, once', () => {
    useGame.setState({ premium: 499 });
    state().unlock('brt');
    expect(state().unlocked).toEqual([]);
    useGame.setState({ premium: 500 });
    state().unlock('brt');
    expect(state().unlocked).toEqual(['brt']);
    expect(state().vehicle).toBe('brt');
    expect(state().premium).toBe(0);
    useGame.setState({ premium: 500 });
    state().unlock('brt');
    expect(state().premium).toBe(500);
    state().unlock('okada');
    expect(state().unlocked).toEqual(['brt']);
  });

  it('addAdView unlocks the BRT at its ad count and ignores anything else', () => {
    expect(state().addAdView('okada')).toBe(0);
    expect(state().addAdView('brt')).toBe(1);
    expect(state().unlocked).toEqual(['brt']);
    expect(state().vehicle).toBe('brt');
    expect(state().addAdView('brt')).toBe(0);
    expect(state().adViews.brt).toBe(1);
  });
});
