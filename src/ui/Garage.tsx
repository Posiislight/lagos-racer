import { Suspense, lazy, useState } from 'react';
import { useGame } from '../game/store';
import { VEHICLES, paintOf, type VehicleId } from '../config/vehicles';
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
  const { vehicle, setVehicle, setScreen, coins, unlocked, unlock, paint, setPaint, driver, setDriver, campaign, upgrades, buyUpgrade } = useGame();
  const [looking, setLooking] = useState<VehicleId>(vehicle);
  const v = VEHICLES.find(x => x.id === looking)!;
  const isLocked = !!v.locked && !unlocked.includes(v.id);
  const current = paintOf(v, paint[v.id]);
  const levels = levelsFor(upgrades, v.id);
  const stats = displayStats(v, levels);
  return (
    <div className="garage">
      <header className="garage-head">
        <button className="btn" onClick={() => setScreen('menu')}>← Back</button>
        <h1>Garage</h1>
        <div className="coins" aria-label={`${coins} naira`}>{formatNaira(coins)}</div>
      </header>
      <div className="garage-body">
        <div className="garage-preview">
          <Suspense fallback={null}><Preview id={looking} color={current.color} driver={driver} /></Suspense>
        </div>
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
            {v.paints.map(p => (
              <button
                key={p.id}
                className={`swatch${p.id === current.id ? ' on' : ''}`}
                style={{ background: p.color }}
                aria-label={`${p.name} paint`}
                aria-pressed={p.id === current.id}
                onClick={() => setPaint(v.id, p.id)}
              />
            ))}
            <span className="paint-name">{current.name}</span>
          </div>
          {isLocked ? (
            <>
              <p className="muted">Unlock this ride to upgrade it.</p>
              <button className="btn primary" disabled={coins < v.locked!.coins} onClick={() => unlock(v.id)}>
                {coins < v.locked!.coins ? `Locked: ${formatNaira(v.locked!.coins)} to unlock` : `Unlock for ${formatNaira(v.locked!.coins)}`}
              </button>
            </>
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
            <button key={x.id} role="tab" aria-selected={x.id === looking} onClick={() => setLooking(x.id)}>
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
