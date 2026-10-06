import { beforeEach, describe, expect, it } from 'vitest';
import { CHAPTER_1 } from '../config/campaign';
import { AD_GEMS } from '../config/premium';
import { todayKey } from './save';
import { useGame } from './store';

const [r1, , , duel] = CHAPTER_1;
const state = () => useGame.getState();

beforeEach(() => {
  useGame.setState({
    coins: 0, coinsEarned: 0, earnedStars: 0, roomCapped: false, campaign: { cleared: [], stars: {} }, roomEarned: { day: '', naira: 0 },
    driver: 'moshood', spec: null, outcome: null, best: {}, track: 'ojuelegba',
  });
});

describe('startRace', () => {
  it('goes to the race screen with the chosen spec', () => {
    state().startRace(r1);
    expect(state().screen).toBe('race');
    expect(state().spec).toBe(r1);
  });
});

describe('finishRace (solo)', () => {
  it('pays by stars, records the best, and only pays again for the same stars', () => {
    state().startRace(r1);
    state().finishRace([], 2, null);
    expect(state().coins).toBe(60_000);
    expect(state().coinsEarned).toBe(60_000);
    expect(state().earnedStars).toBe(2);
    expect(state().campaign.stars['campaign-1-1']).toBe(2);
    expect(state().outcome).toEqual({ place: 2, stars: 2, newBest: true, passed: true, firstClear: true, unlocked: null });
    state().startRace(r1);
    state().finishRace([], 2, null);
    expect(state().coins).toBe(120_000);
    expect(state().outcome?.newBest).toBe(false);
    expect(state().outcome?.firstClear).toBe(false);
  });

  it('a worse replay pays its own stars and keeps the saved best', () => {
    useGame.setState({ campaign: { cleared: ['campaign-1-1'], stars: { 'campaign-1-1': 3 } } });
    state().startRace(r1);
    state().finishRace([], 3, null);
    expect(state().coins).toBe(30_000);
    expect(state().campaign.stars['campaign-1-1']).toBe(3);
  });

  it('a lost duel pays nothing and unlocks nothing; a won duel pays 100,000 and unlocks Mama Put', () => {
    state().startRace(duel);
    state().finishRace([], 2, null);
    expect(state().coins).toBe(0);
    expect(state().campaign.cleared).toEqual([]);
    expect(state().outcome?.unlocked).toBeNull();
    state().startRace(duel);
    state().finishRace([], 1, null);
    expect(state().coins).toBe(100_000);
    expect(state().campaign.cleared).toContain('campaign-1-4');
    expect(state().outcome?.unlocked).toBe('mamaput');
  });

  it('4th place pays nothing', () => {
    state().startRace(r1);
    state().finishRace([], 4, null);
    expect(state().coins).toBe(0);
    expect(state().coinsEarned).toBe(0);
  });

  it('files the best lap under the track the race was run on', () => {
    state().startRace(CHAPTER_1[1]);
    state().finishRace([], 1, 70);
    expect(state().best).toEqual({ 'third-mainland': 70 });
  });
});

describe('finishRace (room)', () => {
  const room = { trackId: 'ikorodu', dnf: false };

  it('pays half, adds to today, and has no outcome', () => {
    state().finishRace([], 1, null, room);
    expect(state().coins).toBe(50_000);
    expect(state().roomEarned).toEqual({ day: todayKey(), naira: 50_000 });
    expect(state().roomCapped).toBe(false);
    expect(state().earnedStars).toBe(0);
    expect(state().outcome).toBeNull();
  });

  it('pays nothing for a DNF', () => {
    state().finishRace([], 1, null, { ...room, dnf: true });
    expect(state().coins).toBe(0);
  });

  it('stops at the daily cap', () => {
    useGame.setState({ roomEarned: { day: todayKey(), naira: 280_000 } });
    state().finishRace([], 1, null, room);
    expect(state().coins).toBe(20_000);
    expect(state().roomEarned.naira).toBe(300_000);
    expect(state().roomCapped).toBe(true);
  });

  it("starts again from 0 on a new day", () => {
    useGame.setState({ roomEarned: { day: '2000-01-01', naira: 280_000 } });
    state().finishRace([], 1, null, room);
    expect(state().coins).toBe(50_000);
    expect(state().roomEarned).toEqual({ day: todayKey(), naira: 50_000 });
  });

  it("files the best lap under the room's track", () => {
    state().finishRace([], 1, 70, room);
    expect(state().best).toEqual({ ikorodu: 70 });
  });
});

describe('setDriver', () => {
  it('ignores a locked driver until the duel is cleared', () => {
    state().setDriver('mamaput');
    expect(state().driver).toBe('moshood');
    useGame.setState({ campaign: { cleared: ['campaign-1-4'], stars: {} } });
    state().setDriver('mamaput');
    expect(state().driver).toBe('mamaput');
  });
});

describe('buyUpgrade', () => {
  const reset = (coins: number) => useGame.setState({ coins, unlocked: [], upgrades: {} });

  it('charges the level price and raises the level', () => {
    reset(100_000);
    expect(state().buyUpgrade('okada', 'speed')).toBe(true);
    expect(state().coins).toBe(20_000);
    expect(state().upgrades.okada?.speed).toBe(1);
  });

  it('does nothing when the player is short of naira', () => {
    reset(79_999);
    expect(state().buyUpgrade('okada', 'speed')).toBe(false);
    expect(state().coins).toBe(79_999);
    expect(state().upgrades.okada).toBeUndefined();
  });

  it('does nothing at level 5', () => {
    useGame.setState({ coins: 10_000_000, unlocked: [], upgrades: { okada: { speed: 5, handling: 0, toughness: 0 } } });
    expect(state().buyUpgrade('okada', 'speed')).toBe(false);
    expect(state().coins).toBe(10_000_000);
    expect(state().upgrades.okada?.speed).toBe(5);
  });

  it('does nothing for a vehicle that is still locked, then works once it is unlocked', () => {
    reset(10_000_000);
    expect(state().buyUpgrade('brt', 'toughness')).toBe(false);
    expect(state().coins).toBe(10_000_000);
    useGame.setState({ unlocked: ['brt'] });
    expect(state().buyUpgrade('brt', 'toughness')).toBe(true);
    expect(state().upgrades.brt?.toughness).toBe(1);
  });

  it('buys once when a second tap arrives with money for only one', () => {
    reset(100_000);
    expect(state().buyUpgrade('okada', 'speed')).toBe(true);
    expect(state().buyUpgrade('okada', 'speed')).toBe(false);
    expect(state().upgrades.okada?.speed).toBe(1);
    expect(state().coins).toBe(20_000);
  });

  it("keeps each vehicle's upgrades separate", () => {
    reset(500_000);
    state().buyUpgrade('okada', 'speed');
    expect(state().upgrades.danfo).toBeUndefined();
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

  it('awardAdGems adds the ad reward to the balance', () => {
    useGame.setState({ premium: 3 });
    expect(state().awardAdGems()).toBe(AD_GEMS);
    expect(state().premium).toBe(3 + AD_GEMS);
  });

  it('claimPurchasedNaira adds bought naira to coins once', () => {
    useGame.setState({ coins: 5, coinsClaimed: 0 });
    expect(state().claimPurchasedNaira(250_000)).toBe(250_000);
    expect([state().coins, state().coinsClaimed]).toEqual([250_005, 250_000]);
    expect(state().claimPurchasedNaira(250_000)).toBe(0);
    expect(state().claimPurchasedNaira(1_250_000)).toBe(1_000_000);
  });

  it('claimPurchasedGems adds only what has not been claimed, so a repeat or a stale total adds nothing', () => {
    useGame.setState({ premium: 10, gemsClaimed: 0 });
    expect(state().claimPurchasedGems(100)).toBe(100);
    expect([state().premium, state().gemsClaimed]).toEqual([110, 100]);
    expect(state().claimPurchasedGems(100)).toBe(0);
    expect(state().claimPurchasedGems(40)).toBe(0);
    expect(state().claimPurchasedGems(200)).toBe(100);
    expect([state().premium, state().gemsClaimed]).toEqual([210, 200]);
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

  it('unlock pays the BRT price in naira, once', () => {
    useGame.setState({ coins: 999_999 });
    state().unlock('brt');
    expect(state().unlocked).toEqual([]);
    useGame.setState({ coins: 1_000_000 });
    state().unlock('brt');
    expect(state().unlocked).toEqual(['brt']);
    expect(state().vehicle).toBe('brt');
    expect(state().coins).toBe(0);
    useGame.setState({ coins: 1_000_000 });
    state().unlock('brt');
    expect(state().coins).toBe(1_000_000);
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

describe('setQualityMode', () => {
  it('picking a level by hand turns automatic lowering off', () => {
    state().setQualityMode('low');
    expect(state().settings).toMatchObject({ quality: 'low', autoQuality: false });
    state().setQualityMode('high');
    expect(state().settings).toMatchObject({ quality: 'high', autoQuality: false });
  });

  it('picking Auto turns it on again and starts over from the starting level', () => {
    state().setQualityMode('low');
    state().setQualityMode('auto');
    expect(state().settings.autoQuality).toBe(true);
    expect(['high', 'medium']).toContain(state().settings.quality);
  });
});
