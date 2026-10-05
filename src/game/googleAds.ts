import type { AdProvider } from './ads';

/** The parts of Google's H5 Games Ads `adBreak` call that we use. */
interface AdBreakRequest {
  type: 'reward';
  name: string;
  beforeReward: (showAd: () => void) => void;
  adViewed: () => void;
  adDismissed: () => void;
  adBreakDone: () => void;
}

declare global {
  interface Window { adsbygoogle?: unknown[]; }
}

const SCRIPT = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
/** Give up on an ad that never reports back, so the Garage button does not hang. */
const AD_TIMEOUT_MS = 60_000;

export interface GoogleAdOptions {
  /** AdSense publisher id, ca-pub-… (public; it is in the page source of any site that shows ads). */
  client: string;
  /** Placeholder ads: no revenue and safe to click. Must be off only in a live production build. */
  testMode: boolean;
  /** Loads the Google script. Replaceable so tests need no network. */
  load?: (client: string, testMode: boolean) => Promise<void>;
}

/** Adds the AdSense script once, on first use, so it costs nothing until a player asks for an ad. */
export function loadAdsScript(client: string, testMode: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector('script[data-lagos-ads]')) return resolve();
    const s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = `${SCRIPT}?client=${encodeURIComponent(client)}`;
    s.dataset.lagosAds = '1';
    s.setAttribute('data-ad-client', client);
    if (testMode) s.setAttribute('data-adbreak-test', 'on');
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('ad script blocked or offline'));
    document.head.appendChild(s);
  });
}

/** A rewarded-ad provider backed by Google H5 Games Ads. Resolves true only if the ad was watched to the end. */
export function createGoogleAdProvider({ client, testMode, load = loadAdsScript }: GoogleAdOptions): AdProvider {
  return async () => {
    await load(client, testMode);
    const queue = (window.adsbygoogle = window.adsbygoogle || []);
    return new Promise<boolean>(resolve => {
      let rewarded = false;
      const timer = setTimeout(() => resolve(false), AD_TIMEOUT_MS);
      const finish = () => { clearTimeout(timer); resolve(rewarded); };
      const request: AdBreakRequest = {
        type: 'reward',
        name: 'unlock-vehicle',
        beforeReward: showAd => showAd(),
        adViewed: () => { rewarded = true; },
        adDismissed: () => { rewarded = false; },
        // Also fires when there is no fill or the ad is not ready: then nothing was rewarded.
        adBreakDone: finish,
      };
      queue.push({ ...request });
    });
  };
}
