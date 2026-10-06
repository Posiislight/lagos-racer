/**
 * Rewarded ads. This file is the only place a real ad network plugs in: call `setAdProvider` with a
 * function that shows the ad and resolves true only when the player watched it to the end.
 * Until then there are no ads, so `adsAvailable()` is false and nothing is rewarded.
 */
export type AdProvider = () => Promise<boolean>;

let provider: AdProvider | null = null;

export const setAdProvider = (p: AdProvider | null) => { provider = p; };
export const adsAvailable = () => provider !== null;

/**
 * A dev-only stand-in, installed from main.tsx in dev builds with no ad network id. It covers the screen
 * with a fake ad and counts down; the reward comes only when the countdown ends, and closing early gives none.
 */
export const devAdStub: AdProvider = (seconds = 5) => new Promise(resolve => {
  const box = document.createElement('div');
  box.setAttribute('role', 'dialog');
  box.style.cssText = 'position:fixed;inset:0;z-index:9999;display:grid;place-items:center;align-content:center;gap:12px;background:#111;color:#fff;font:700 22px system-ui,sans-serif;text-align:center';
  const label = document.createElement('div');
  const close = document.createElement('button');
  close.textContent = 'Close (no reward)';
  close.style.cssText = 'font:inherit;font-size:14px;padding:6px 12px;border-radius:10px';
  box.append(label, close);
  document.body.appendChild(box);
  let left = seconds;
  const draw = () => { label.textContent = `Test ad playing… ${left}`; };
  const end = (rewarded: boolean) => { clearInterval(timer); box.remove(); resolve(rewarded); };
  const timer = setInterval(() => { left -= 1; if (left <= 0) end(true); else draw(); }, 1000);
  close.onclick = () => end(false);
  draw();
});

/** Shows one rewarded ad. True only if the player earned the reward; a failed or missing ad is false. */
export async function showRewardedAd(): Promise<boolean> {
  if (!provider) return false;
  try { return (await provider()) === true; } catch { return false; }
}
