import { Suspense, lazy, useEffect } from 'react';
import { useGame } from './game/store';
import { setSoundEnabled, unlockAudio } from './game/audio';
import { setRadioMuted } from './game/radio';
import { startKeyboard } from './game/input';
import { Menu } from './ui/Menu';
import { Garage } from './ui/Garage';
import { Campaign } from './ui/Campaign';
import { Online } from './ui/Online';
import { Lobby } from './ui/Lobby';
import { useFakeLandscape } from './ui/RotatePrompt';
import { InAppBrowserBanner } from './ui/InAppBrowserBanner';

// The race (three.js, physics, models) is loaded on demand so the menu appears fast on mobile data.
const loadRace = () => import('./ui/Race');
const Race = lazy(loadRace);

// Once the menu is up and the browser is idle, fetch the race chunk in the background so the first race starts fast.
function prefetchRace() {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return; // respect Data Saver
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
  if (idle) idle(() => { void loadRace(); });
  else setTimeout(() => { void loadRace(); }, 2000);
}

export function App() {
  const screen = useGame(s => s.screen);
  const sound = useGame(s => s.settings.sound);
  const rotated = useFakeLandscape();

  useEffect(() => { startKeyboard(); }, []);
  useEffect(() => { prefetchRace(); }, []);
  // A friend's invite link (?room=CODE) lands straight on the join screen.
  useEffect(() => { if (new URLSearchParams(location.search).has('room')) useGame.getState().setScreen('online'); }, []);
  useEffect(() => { setSoundEnabled(sound); setRadioMuted(!sound); }, [sound]);
  useEffect(() => {
    // Browsers only allow audio after a user gesture.
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, []);

  return (
    <div className="app" data-rotated={rotated ? '' : undefined}>
      {screen === 'menu' && <Menu />}
      {screen === 'garage' && <Garage />}
      {screen === 'campaign' && <Campaign />}
      {screen === 'online' && <Online />}
      {screen === 'lobby' && <Lobby />}
      {screen === 'race' && (
        <Suspense fallback={<Loading />}>
          <Race />
        </Suspense>
      )}
      {screen === 'menu' && <InAppBrowserBanner />}
    </div>
  );
}

export function Loading({ text = 'Loading Lagos…' }: { text?: string }) {
  return (
    <div className="loading">
      <div className="loading-board">
        <small>Please wait small</small>
        <h1>{text}</h1>
      </div>
    </div>
  );
}
