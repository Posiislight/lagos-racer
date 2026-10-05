import { describe, expect, it } from 'vitest';
import { chromeIntentUrl, inAppBrowser } from './inAppBrowser';

const IG = 'Mozilla/5.0 (Linux; Android 13; TECNO KG5) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 Instagram 310.0.0.0 Android';
const FB = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 [FBAN/FBIOS;FBAV/440.0]';
const CHROME = 'Mozilla/5.0 (Linux; Android 13; TECNO KG5) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';

describe('inAppBrowser', () => {
  it('names the app', () => {
    expect(inAppBrowser(IG)).toBe('Instagram');
    expect(inAppBrowser(FB)).toBe('Facebook');
    expect(inAppBrowser('Mozilla/5.0 (Linux; Android 12) Chrome/110 musical_ly_2023')).toBe('TikTok');
  });
  it('leaves normal browsers alone', () => {
    expect(inAppBrowser(CHROME)).toBeNull();
    expect(inAppBrowser('Mozilla/5.0 (iPhone) Safari/604.1')).toBeNull();
  });
});

describe('chromeIntentUrl', () => {
  it('builds an Android intent that keeps the room code', () => {
    expect(chromeIntentUrl(IG, 'https://lagos.example/?room=ABCD')).toBe('intent://lagos.example/?room=ABCD#Intent;scheme=https;package=com.android.chrome;end');
  });
  it('is null off Android', () => {
    expect(chromeIntentUrl(FB, 'https://lagos.example/')).toBeNull();
  });
});
