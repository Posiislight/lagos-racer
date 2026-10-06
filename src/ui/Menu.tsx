import { Suspense, lazy, useState } from 'react';
import { useGame } from '../game/store';
import { paintOf, vehicleById } from '../config/vehicles';
import { TRACKS } from '../config/tracks';
import { driverById } from '../config/drivers';
import { formatNaira } from '../config/economy';
import { AD_GEMS, PAINT_PRICE, PREMIUM_LABEL } from '../config/premium';
import { adsAvailable, showRewardedAd } from '../game/ads';
import { Settings } from './Settings';
import { HowToRace } from './HowToRace';
import { shouldShowHowTo } from '../game/onboarding';
import { SyncChip } from './SyncManager';
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
  const { vehicle, coins, premium, awardAdGems, unlocked, setScreen, paint, driver, onboarded, races, campaign, finishOnboarding } = useGame();
  const [howTo, setHowTo] = useState(false);
  const [settings, setSettings] = useState(false);
  const [shop, setShop] = useState(false);
  const [adRunning, setAdRunning] = useState(false);
  const watchForGems = async () => {
    setAdRunning(true);
    try { if (await showRewardedAd()) awardAdGems(); } finally { setAdRunning(false); }
  };
  const v = vehicleById(vehicle), p = paintOf(v, paint[v.id]), d = driverById(driver), credit = menuCredit(TRACKS);
  // The Garage button gets a dot when the player can afford a paint or the BRT.
  const brt = vehicleById('brt').locked;
  const garageHint = premium >= PAINT_PRICE || (!!brt && !unlocked.includes('brt') && coins >= brt.naira);
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
          <button className="coins premium gems" aria-label={`Get ${PREMIUM_LABEL}, you have ${premium}`} onClick={() => setShop(true)}>{PREMIUM_LABEL} {premium} +</button>
          <button className="btn small garage-btn" onClick={() => setScreen('garage')}>
            Garage{garageHint && <i className="hint-dot" role="img" aria-label="something you can afford" />}
          </button>
          <button className="btn small" onClick={() => setSettings(true)} aria-label="Settings" title="Settings">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
            </svg>
          </button>
          <SyncChip />
          <button className="btn small" onClick={() => setHowTo(true)} aria-label="How to play">?</button>
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
      {(howTo || shouldShowHowTo(onboarded, races, campaign.cleared.length)) && (
        <HowToRace onDone={() => { setHowTo(false); finishOnboarding(); }} />
      )}
      {settings && <Settings onClose={() => setSettings(false)} />}
      {shop && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="shop-title">
          <div className="card modal-card">
            <h2 id="shop-title">Get {PREMIUM_LABEL}</h2>
            <p className="muted">{PREMIUM_LABEL} buy new paints in the Garage. The BRT costs naira.</p>
            {adsAvailable() && (
              <button className="btn primary" disabled={adRunning} onClick={watchForGems}>
                {adRunning ? 'Playing ad…' : `Watch an ad for ${AD_GEMS} ${PREMIUM_LABEL}`}
              </button>
            )}
            <button className="btn" onClick={() => { setShop(false); setScreen('garage'); }}>Go to Garage</button>
            <button className="btn primary" onClick={() => setShop(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
