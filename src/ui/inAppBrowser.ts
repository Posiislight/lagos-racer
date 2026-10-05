/** Names of in-app browsers (the webview inside another app), which block fullscreen, orientation lock and installing. */
const APPS: [RegExp, string][] = [
  [/Instagram/i, 'Instagram'],
  [/FBAN|FBAV|FB_IAB|FB4A/i, 'Facebook'],
  [/musical_ly|BytedanceWebview|TikTok|trill/i, 'TikTok'],
  [/Snapchat/i, 'Snapchat'],
  [/Twitter|TwitterAndroid/i, 'X'],
  [/LinkedInApp/i, 'LinkedIn'],
  [/\bLine\//i, 'LINE'],
  [/MicroMessenger/i, 'WeChat'],
];

/** The app whose in-app browser this is, or null in a normal browser. */
export function inAppBrowser(ua: string): string | null {
  for (const [re, name] of APPS) if (re.test(ua)) return name;
  return null;
}

/** An Android link that opens this page in Chrome, or null elsewhere (iPhones have no such link). */
export function chromeIntentUrl(ua: string, href: string): string | null {
  if (!/Android/i.test(ua)) return null;
  try {
    const u = new URL(href);
    return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.replace(':', '')};package=com.android.chrome;end`;
  } catch { return null; }
}
