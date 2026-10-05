import { Suspense, lazy, useState } from 'react';
import { useGame } from '../game/store';
import { VEHICLES, ownsPaint, paintOf, paintPrice, type VehicleId } from '../config/vehicles';
import { PREMIUM_LABEL } from '../config/premium';
import { adsAvailable, showRewardedAd } from '../game/ads';
import { DRIVERS } from '../config/drivers';
import { driverAvailable } from '../game/campaign';

const Preview = lazy(() => import('./Preview'));

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <>
      <span>{label}</span>
      <div className="bar" role="img" aria-label={`${label}: ${value} out of 10`}><i style={{ width: `${value * 10}%` }} /></div>
    </>
  );
}

export function Garage() {
  const { vehicle, setVehicle, setScreen, coins, premium, ownedPaints, adViews, unlocked, unlock, addAdView, buyPaint, paint, setPaint, driver, setDriver, campaign } = useGame();
  const [looking, setLooking] = useState<VehicleId>(vehicle);
  // A paint being looked at without owning it yet (null: showing the chosen one).
  const [peek, setPeek] = useState<string | null>(null);
  const [adRunning, setAdRunning] = useState(false);
  const v = VEHICLES.find(x => x.id === looking)!;
  const isLocked = !!v.locked && !unlocked.includes(v.id);
  const current = paintOf(v, paint[v.id]);
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
        <div className="coins">₦ {coins}</div>
        <div className="coins premium">{PREMIUM_LABEL} {premium}</div>
      </header>
      <div className="garage-body">
        <div className="garage-preview">
          <Suspense fallback={null}><Preview id={looking} color={shown.color} driver={driver} /></Suspense>
        </div>
        <div className="card garage-card">
          <h2>{v.name}</h2>
          <p className="muted">{v.blurb}</p>
          <div className="stats">
            <Bar label="Speed" value={v.stats.speed} />
            <Bar label="Handling" value={v.stats.handling} />
            <Bar label="Toughness" value={v.stats.toughness} />
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
      <div className="drivers" role="tablist" aria-label="Drivers">
        {DRIVERS.map(d => {
          const open = driverAvailable(d.id, campaign.cleared);
          return (
            <button key={d.id} role="tab" aria-selected={d.id === driver} aria-disabled={!open} className={open ? undefined : 'locked'} onClick={() => { if (open) setDriver(d.id); }}>
              <b>{d.name}</b><span className="role"> · {d.role}</span>{!open && <span className="lock" aria-label="locked"> 🔒</span>}
              <span className="special">{d.special.name} · charges in {d.special.chargeTime} s</span>
              <small>{open ? d.blurb : `Beat ${d.name} in the campaign to unlock`}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}
