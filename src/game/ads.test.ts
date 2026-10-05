import { afterEach, describe, expect, it } from 'vitest';
import { adsAvailable, setAdProvider, showRewardedAd } from './ads';

afterEach(() => setAdProvider(null));

describe('rewarded ads', () => {
  it('without a provider there are no ads and nothing is rewarded', async () => {
    expect(adsAvailable()).toBe(false);
    expect(await showRewardedAd()).toBe(false);
  });

  it('rewards only when the provider says the ad was watched', async () => {
    setAdProvider(async () => true);
    expect(adsAvailable()).toBe(true);
    expect(await showRewardedAd()).toBe(true);
    setAdProvider(async () => false);
    expect(await showRewardedAd()).toBe(false);
  });

  it('a provider that throws gives no reward and no rejection', async () => {
    setAdProvider(async () => { throw new Error('no fill'); });
    expect(await showRewardedAd()).toBe(false);
  });
});
