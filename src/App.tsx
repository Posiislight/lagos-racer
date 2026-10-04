import { Suspense, lazy, useEffect } from 'react';
import { useGame } from './game/store';
import { setSoundEnabled, unlockAudio } from './game/audio';
import { startKeyboard } from './game/input';
import { Menu } from './ui/Menu';
import { Garage } from './ui/Garage';
import { Campaign } from './ui/Campaign';

// The race (three.js, physics, models) is loaded on demand so the menu appears fast on mobile data.
const Race = lazy(() => import('./ui/Race'));

export function App() {
  const screen = useGame(s => s.screen);
  const sound = useGame(s => s.settings.sound);

  useEffect(() => { startKeyboard(); }, []);
  useEffect(() => { setSoundEnabled(sound); }, [sound]);
  useEffect(() => {
    // Browsers only allow audio after a user gesture.
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, []);

  return (
    <div className="app">
      {screen === 'menu' && <Menu />}
      {screen === 'garage' && <Garage />}
      {screen === 'campaign' && <Campaign />}
      {screen === 'race' && (
        <Suspense fallback={<Loading />}>
          <Race />
        </Suspense>
      )}
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
