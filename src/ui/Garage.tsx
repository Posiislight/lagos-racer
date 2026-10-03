import { Suspense, lazy, useState } from 'react';
import { useGame } from '../game/store';
import { VEHICLES, type VehicleId } from '../config/vehicles';

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
  const { vehicle, setVehicle, setScreen, coins, unlocked, unlock } = useGame();
  const [looking, setLooking] = useState<VehicleId>(vehicle);
  const v = VEHICLES.find(x => x.id === looking)!;
  const isLocked = !!v.locked && !unlocked.includes(v.id);
  return (
    <div className="garage">
      <header className="garage-head">
        <button className="btn" onClick={() => setScreen('menu')}>← Back</button>
        <h1>Garage</h1>
        <div className="coins">₦ {coins}</div>
      </header>
      <div className="garage-body">
        <div className="garage-preview">
          <Suspense fallback={null}><Preview id={looking} /></Suspense>
        </div>
        <div className="card garage-card">
          <h2>{v.name}</h2>
          <p className="muted">{v.blurb}</p>
          <div className="stats">
            <Bar label="Speed" value={v.stats.speed} />
            <Bar label="Handling" value={v.stats.handling} />
            <Bar label="Toughness" value={v.stats.toughness} />
          </div>
          {isLocked ? (
            <button className="btn primary" disabled={coins < v.locked!.coins} onClick={() => unlock(v.id)}>
              {coins < v.locked!.coins ? `Locked: ₦ ${v.locked!.coins} to unlock` : `Unlock for ₦ ${v.locked!.coins}`}
            </button>
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
              <span className="dot" style={{ background: x.color }} />{x.name}{locked && <span className="lock" aria-label="locked"> 🔒</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
