import { Suspense, lazy, useState } from 'react';
import { useGame } from '../game/store';
import { paintOf, vehicleById } from '../config/vehicles';
import { TRACKS, trackOrDefault } from '../config/tracks';
import { driverById } from '../config/drivers';
import { formatTime } from '../game/race';
import { Settings } from './Settings';
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

/** Start a race from a button press: fullscreen and tilt need the tap, then the quick race or the campaign race. */
export function launchRace(spec?: RaceSpec) {
  goFullscreen();
  if (useGame.getState().settings.steering === 'tilt') void enableTilt();
  useGame.getState().startRace(spec);
}

export function Menu() {
  const { vehicle, coins, setScreen, best, track, paint, driver, setTrack } = useGame();
  const [settings, setSettings] = useState(false);
  const v = vehicleById(vehicle), t = trackOrDefault(track), p = paintOf(v, paint[v.id]), d = driverById(driver);
  return (
    <div className="menu">
      <div className="menu-stripes" aria-hidden="true" />
      <header className="menu-head">
        <div className="board">
          <small>Ojuelegba Grand Prix</small>
          <h1>LAGOS RACER</h1>
        </div>
        <div className="coins" aria-label={`${coins} coins`}>₦ {coins}</div>
      </header>
      <div className="menu-preview">
        <Suspense fallback={null}><Preview id={vehicle} color={p.color} driver={driver} /></Suspense>
      </div>
      <div className="menu-side">
        <div className="card">
          <p className="eyebrow">Your ride</p>
          <h2>{v.name}</h2>
          <p className="driver-line"><b>{d.name}</b> at the wheel · {d.special.name}</p>
          <p className="muted">{v.blurb}</p>
          <div className="track-picker" role="radiogroup" aria-label="Track">
            {TRACKS.map(k => (
              <button key={k.id} role="radio" aria-checked={k.id === t.id} className={`track-chip${k.id === t.id ? ' on' : ''}`} onClick={() => setTrack(k.id)}>{k.name}</button>
            ))}
          </div>
          <p className="track-line"><b>{t.name}</b> · {t.laps} laps · best lap {formatTime(best[t.id] ?? null)}</p>
          <p className="muted">{t.blurb}</p>
          <p className="credit muted">Road layout © OpenStreetMap contributors</p>
        </div>
        <button className="btn primary big" onClick={() => setScreen('campaign')}>CAMPAIGN</button>
        <div className="row menu-row">
          <button className="btn" onClick={() => launchRace()}>OYA, RACE!</button>
          <button className="btn" onClick={() => setScreen('garage')}>Garage</button>
          <button className="btn" onClick={() => setSettings(true)}>Settings</button>
        </div>
        <p className="keys muted">You're always on the gas · ← → or A D to steer · Space to use items · Q for your special · C to drift · H to honk · Esc to pause</p>
      </div>
      {settings && <Settings onClose={() => setSettings(false)} />}
    </div>
  );
}
