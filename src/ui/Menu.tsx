import { Suspense, lazy, useState } from 'react';
import { useGame } from '../game/store';
import { paintOf, vehicleById } from '../config/vehicles';
import { TRACKS } from '../config/tracks';
import { driverById } from '../config/drivers';
import { formatNaira } from '../config/economy';
import { Settings } from './Settings';
import { MENU_TAGLINE, menuCredit } from './menuText';
import { enableTilt } from '../game/input';
import type { RaceSpec } from '../config/campaign';

const Preview = lazy(() => import('./Preview'));

/** Ask for fullscreen and landscape on phones; ignore it where unsupported. */
export function goFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen && matchMedia('(pointer: coarse)').matches) {
    el.requestFullscreen({ navigationUI: 'hide' })
      .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
      .catch(() => {});
  }
}

/** Start a race from a button press: fullscreen and tilt need the tap, then the campaign race. */
export function launchRace(spec: RaceSpec) {
  goFullscreen();
  if (useGame.getState().settings.steering === 'tilt') void enableTilt();
  useGame.getState().startRace(spec);
}

export function Menu() {
  const { vehicle, coins, setScreen, paint, driver } = useGame();
  const [settings, setSettings] = useState(false);
  const v = vehicleById(vehicle), p = paintOf(v, paint[v.id]), d = driverById(driver), credit = menuCredit(TRACKS);
  return (
    <div className="menu">
      <div className="menu-stripes" aria-hidden="true" />
      <header className="menu-head">
        <div className="board">
          <small>{MENU_TAGLINE}</small>
          <h1>LAGOS RACER</h1>
        </div>
        <div className="menu-corner">
          <div className="coins" aria-label={`${coins} naira`}>{formatNaira(coins)}</div>
          <button className="btn small" onClick={() => setScreen('garage')}>Garage</button>
          <button className="btn small" onClick={() => setSettings(true)}>Settings</button>
        </div>
      </header>
      <div className="menu-preview">
        <Suspense fallback={null}><Preview id={vehicle} color={p.color} driver={driver} /></Suspense>
        <p className="menu-caption"><b>{d.name}</b> · {v.name}</p>
      </div>
      <div className="menu-side">
        <div className="menu-entries">
          <button className="entry primary" onClick={() => setScreen('campaign')}>
            <b>SINGLE PLAYER</b>
            <span>Race the campaign across Lagos.</span>
          </button>
          <button className="entry" onClick={() => setScreen('online')}>
            <b>MULTIPLAYER</b>
            <span>Race your friends or anyone online.</span>
          </button>
        </div>
        {credit && <p className="credit muted">Ojuelegba road layout {credit}</p>}
      </div>
      {settings && <Settings onClose={() => setSettings(false)} />}
    </div>
  );
}
