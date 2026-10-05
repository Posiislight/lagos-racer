/**
 * Rewarded ads. This file is the only place a real ad network plugs in: call `setAdProvider` with a
 * function that shows the ad and resolves true only when the player watched it to the end.
 * Until then there are no ads, so `adsAvailable()` is false and nothing is rewarded.
 */
export type AdProvider = () => Promise<boolean>;

let provider: AdProvider | null = null;

export const setAdProvider = (p: AdProvider | null) => { provider = p; };
export const adsAvailable = () => provider !== null;

/** A dev-only stand-in that "plays" an ad for a moment, installed from main.tsx in dev builds. */
export const devAdStub: AdProvider = () => new Promise(resolve => setTimeout(() => resolve(true), 800));

/** Shows one rewarded ad. True only if the player earned the reward; a failed or missing ad is false. */
export async function showRewardedAd(): Promise<boolean> {
  if (!provider) return false;
  try { return (await provider()) === true; } catch { return false; }
}
