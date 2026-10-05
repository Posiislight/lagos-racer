import { Suspense, lazy, useState } from 'react';
import { useGame } from '../game/store';
import { VEHICLES, ownsPaint, paintOf, paintPrice, type VehicleId } from '../config/vehicles';
import { PREMIUM_LABEL } from '../config/premium';
import { adsAvailable, showRewardedAd } from '../game/ads';
import { DRIVERS } from '../config/drivers';
import { driverAvailable } from '../game/campaign';
import { MAX_UPGRADE_LEVEL, formatNaira, upgradePrice } from '../config/economy';
import { UPGRADE_KINDS, UPGRADE_LABEL, displayStats, levelsFor } from '../game/upgrades';

const Preview = lazy(() => import('./Preview'));

function Bar({ label, base, bonus }: { label: string; base: number; bonus: number }) {
  const total = Math.round((base + bonus) * 10) / 10;
  return (
    <>
      <span className="stat-name">{label}</span>
      <div className="bar" role="img" aria-label={`${label}: ${total} out of 10`}>
        <i style={{ width: `${base * 10}%` }} />
        {bonus > 0 && <i className="up" style={{ width: `${bonus * 10}%` }} />}
      </div>
    </>
  );
}

export function Garage() {
  const { vehicle, setVehicle, setScreen, coins, premium, ownedPaints, adViews, unlocked, unlock, addAdView, buyPaint, paint, setPaint, driver, setDriver, campaign, upgrades, buyUpgrade } = useGame();
  const [looking, setLooking] = useState<VehicleId>(vehicle);
  // A paint being looked at without owning it yet (null: showing the chosen one).
  const [peek, setPeek] = useState<string | null>(null);
  const [adRunning, setAdRunning] = useState(false);
  const v = VEHICLES.find(x => x.id === looking)!;
  const isLocked = !!v.locked && !unlocked.includes(v.id);
  const current = paintOf(v, paint[v.id]);
  const levels = levelsFor(upgrades, v.id);
  const stats = displayStats(v, levels);
  const peeked = peek ? v.paints.find(p => p.id === peek) : undefined;
  const shown = peeked ?? current;
  const peekPrice = peeked ? paintPrice(v, peeked.id) : 0;
  const lookAt = (id: VehicleId) => { setLooking(id); setPeek(null); };
  const watchAd = async () => {
    setAdRunning(true);
    try { if (await showRewardedAd()) addAdView(v.id); } finally { setAdRunning(false); }
  };
  return (
    <div className="garage">
      <header className="garage-head">
        <button className="btn" onClick={() => setScreen('menu')}>← Back</button>
        <h1>Garage</h1>
        <div className="coins" aria-label={`${coins} naira`}>{formatNaira(coins)}</div>
        <div className="coins premium" aria-label={`${premium} ${PREMIUM_LABEL}`}>{PREMIUM_LABEL} {premium}</div>
      </header>
      <div className="garage-body">
        <div className="garage-left">
          <div className="garage-preview">
            <Suspense fallback={null}><Preview id={looking} color={shown.color} driver={driver} /></Suspense>
          </div>
          <div className="stops" role="tablist" aria-label="Vehicles">
            {VEHICLES.map(x => {
              const locked = !!x.locked && !unlocked.includes(x.id);
              return (
                <button key={x.id} role="tab" aria-selected={x.id === looking} onClick={() => lookAt(x.id)}>
                  <span className="dot" style={{ background: paintOf(x, paint[x.id]).color }} />{x.name}{locked && <span className="lock" aria-label="locked"> 🔒</span>}
                </button>
              );
            })}
          </div>
        </div>
        <div className="garage-side">
        <div className="card garage-card">
          <h2>{v.name}</h2>
          <p className="muted">{v.blurb}</p>
          <div className="stat-rows">
            {UPGRADE_KINDS.map(kind => {
              const level = levels[kind], price = upgradePrice(level);
              return (
                <div key={kind} className={isLocked ? 'stat-row locked' : 'stat-row'}>
                  <Bar label={UPGRADE_LABEL[kind]} {...stats[kind]} />
                  {!isLocked && (
                    <>
                      <span className="pips" role="img" aria-label={`Level ${level} of ${MAX_UPGRADE_LEVEL}`}>
                        {Array.from({ length: MAX_UPGRADE_LEVEL }, (_, i) => <i key={i} className={i < level ? 'on' : ''} />)}
                      </span>
                      {price === null
                        ? <span className="upgrade-max">MAX</span>
                        : <button className="btn upgrade-buy" disabled={coins < price} onClick={() => buyUpgrade(v.id, kind)}
                            aria-label={`Upgrade ${UPGRADE_LABEL[kind]} for ${formatNaira(price)}`}>{formatNaira(price)}</button>}
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="paints" role="group" aria-label="Paint">
            {v.paints.map(p => {
              const owned = ownsPaint(ownedPaints, v, p.id);
              const price = paintPrice(v, p.id);
              return (
                <button
                  key={p.id}
                  className={`swatch${p.id === shown.id ? ' on' : ''}${owned ? '' : ' unowned'}`}
                  style={{ background: p.color }}
                  aria-label={owned ? `${p.name} paint` : `${p.name} paint, ${price} ${PREMIUM_LABEL}`}
                  aria-pressed={p.id === shown.id}
                  onClick={() => { if (owned) { setPaint(v.id, p.id); setPeek(null); } else setPeek(p.id); }}
                >{owned ? null : '🔒'}</button>
              );
            })}
            <span className="paint-name">{shown.name}</span>
          </div>
          {peeked && peekPrice > 0 ? (
            <button className="btn primary" disabled={premium < peekPrice} onClick={() => { if (buyPaint(v.id, peeked.id)) setPeek(null); }}>
              {premium < peekPrice ? `Need ${peekPrice - premium} more ${PREMIUM_LABEL} for ${peeked.name}` : `Buy ${peeked.name} for ${peekPrice} ${PREMIUM_LABEL}`}
            </button>
          ) : isLocked ? (
            <div className="unlock-options">
              {adsAvailable() && (
                <>
                  <button className="btn primary" disabled={adRunning} onClick={watchAd}>
                    {adRunning ? 'Playing ad…' : `Watch an ad to unlock (${adViews[v.id] ?? 0}/${v.locked!.ads})`}
                  </button>
                  <small className="muted">The ad is optional and uses mobile data.</small>
                </>
              )}
              <button className="btn primary" disabled={premium < v.locked!.premium} onClick={() => unlock(v.id)}>
                {premium < v.locked!.premium ? `Need ${v.locked!.premium - premium} more ${PREMIUM_LABEL} to unlock` : `Unlock for ${v.locked!.premium} ${PREMIUM_LABEL}`}
              </button>
            </div>
          ) : (
            <button className="btn primary" disabled={vehicle === v.id} onClick={() => { setVehicle(v.id); setScreen('menu'); }}>
              {vehicle === v.id ? 'Selected' : 'Ride this one'}
            </button>
          )}
        </div>
        <div className="drivers" role="tablist" aria-label="Drivers">
        {DRIVERS.map(d => {
          const open = driverAvailable(d.id, campaign.cleared);
          return (
            <button key={d.id} role="tab" aria-selected={d.id === driver} aria-disabled={!open} className={open ? undefined : 'locked'} onClick={() => { if (open) setDriver(d.id); }}>
              <b>{d.name}</b><span className="role"> · {d.role}</span>{!open && <span className="lock" aria-label="locked"> 🔒</span>}
              <span className="special">{d.special.name} · charges in {d.special.chargeTime} s</span>
              <small>{open ? d.blurb : `Beat ${d.name} in Single player to unlock`}</small>
            </button>
          );
        })}
        </div>
        </div>
      </div>
    </div>
  );
}
