import { useRegisterSW } from 'virtual:pwa-register/react';

const CHECK_EVERY_MS = 30 * 60 * 1000;

/**
 * Small "new version" banner. A new version downloads in the background and waits; the page the
 * player is on is never swapped or reloaded until they tap Update, so a race or room is never cut off.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Phones keep the game open for hours; look for a new version now and then.
      if (registration) setInterval(() => { registration.update().catch(() => {}); }, CHECK_EVERY_MS);
    },
  });

  if (!needRefresh) return null;
  return (
    <div className="update-prompt" role="status">
      <span>New update available</span>
      <button type="button" onClick={() => { void updateServiceWorker(true); }}>Update</button>
      <button type="button" className="update-later" aria-label="Not now" onClick={() => setNeedRefresh(false)}>✕</button>
    </div>
  );
}
