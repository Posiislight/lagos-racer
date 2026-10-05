import { useState } from 'react';
import { chromeIntentUrl, inAppBrowser } from './inAppBrowser';

const KEY = 'lagos-racer-iab-dismissed';
const read = () => { try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; } };

/** In Instagram, TikTok and friends the game can't go fullscreen or install; suggest opening it in the real browser. */
export function InAppBrowserBanner() {
  const [hidden, setHidden] = useState(read);
  const [copied, setCopied] = useState(false);
  const ua = navigator.userAgent, app = inAppBrowser(ua);
  if (!app || hidden) return null;
  const intent = chromeIntentUrl(ua, location.href);
  const dismiss = () => { setHidden(true); try { sessionStorage.setItem(KEY, '1'); } catch { /* private mode */ } };
  const copy = () => { void navigator.clipboard?.writeText(location.href).then(() => setCopied(true), () => {}); };
  return (
    <div className="iab-banner" role="note">
      <span>You're in {app}'s browser. Open in {intent ? 'Chrome' : 'Safari or Chrome'} for fullscreen and the best speed.</span>
      {intent ? <a className="btn small" href={intent}>Open in Chrome</a> : <button className="btn small" onClick={copy}>{copied ? 'Link copied' : 'Copy link'}</button>}
      <button className="btn small" onClick={dismiss} aria-label="Dismiss">✕</button>
    </div>
  );
}
