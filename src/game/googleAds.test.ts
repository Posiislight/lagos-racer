import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGoogleAdProvider } from './googleAds';

interface Req { beforeReward(show: () => void): void; adViewed(): void; adDismissed(): void; adBreakDone(): void }

// A fake Google script: each pushed adBreak request is handed to `play`.
function fakeGoogle(play: (r: Req) => void) {
  const queue: unknown[] = [];
  (queue as unknown as { push: (r: Req) => number }).push = (r: Req) => { play(r); return 1; };
  (globalThis as unknown as { window: unknown }).window = { adsbygoogle: queue };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); delete (globalThis as unknown as { window?: unknown }).window; });

const make = (load = async () => {}) => createGoogleAdProvider({ client: 'ca-pub-1', testMode: true, load });

describe('google ad provider', () => {
  it('rewards when the ad is viewed', async () => {
    fakeGoogle(r => r.beforeReward(() => { r.adViewed(); r.adBreakDone(); }));
    expect(await make()()).toBe(true);
  });

  it('gives nothing when the ad is dismissed or there is no fill', async () => {
    fakeGoogle(r => r.beforeReward(() => { r.adDismissed(); r.adBreakDone(); }));
    expect(await make()()).toBe(false);
    fakeGoogle(r => r.adBreakDone());
    expect(await make()()).toBe(false);
  });

  it('rejects when the script cannot load (showRewardedAd turns that into no reward)', async () => {
    fakeGoogle(() => {});
    await expect(make(async () => { throw new Error('blocked'); })()).rejects.toThrow();
  });

  it('gives up on an ad that never reports back', async () => {
    fakeGoogle(() => {});
    const p = make()();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await p).toBe(false);
  });
});
