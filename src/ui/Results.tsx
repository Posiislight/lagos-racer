import { useGame, type Result } from '../game/store';
import { formatTime } from '../game/race';
import { vehicleById } from '../config/vehicles';

const PLACE = ['1st', '2nd', '3rd', '4th', '5th', '6th'];
const CHEER = ['Oga at the top! 🏆', 'Second place no bad o!', 'Third. You fit do better.', 'Last? Na wa o. Try again!'];

/** The time column: when a racer was clamped, that they are still in (elimination), or their finish. */
function timeCell(r: Result, elimination: boolean) {
  if (r.out !== null) return `out ${formatTime(r.out)}`;
  if (r.time === null) return elimination ? 'Still in' : 'DNF';
  return (r.projected ? '~' : '') + formatTime(r.time);
}

export function Results() {
  const { results, spec, coinsEarned, startRace, setScreen, showAccountPrompt, dismissAccountPrompt } = useGame();
  if (!results) return null;
  const place = results.findIndex(r => r.isPlayer);
  const elimination = spec?.mode.kind === 'elimination';
  return (
    <div className="modal results" role="dialog" aria-modal="true" aria-labelledby="results-title">
      <div className="card modal-card wide">
        <p className="eyebrow">Ojuelegba Grand Prix</p>
        <h2 id="results-title">{PLACE[place]} place</h2>
        <p className="cheer">{CHEER[Math.min(place, CHEER.length - 1)]}</p>
        <table className="table">
          <thead><tr><th>#</th><th>Driver</th><th>Ride</th><th>Time</th><th>Best lap</th></tr></thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={i} className={r.isPlayer ? 'me' : ''}>
                <td>{i + 1}</td>
                <td>{r.name}</td>
                <td><span className="dot" style={{ background: r.color }} /> {vehicleById(r.vehicle).name}</td>
                <td title={r.projected ? 'Still racing: projected finish' : undefined}>{timeCell(r, elimination)}</td>
                <td>{formatTime(r.best)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="earned">+ ₦ {coinsEarned} coins</p>
        {showAccountPrompt && (
          <div className="account">
            <p><b>Keep your coins safe.</b> Create an account to save your coins and high score on any phone.</p>
            <div className="row">
              <button className="btn" disabled title="Accounts are coming soon">Create account (soon)</button>
              <button className="btn ghost" onClick={dismissAccountPrompt}>Not now</button>
            </div>
          </div>
        )}
        <div className="row">
          <button className="btn primary" onClick={() => startRace(useGame.getState().spec ?? undefined)}>Race again</button>
          <button className="btn" onClick={() => setScreen('garage')}>Garage</button>
          <button className="btn" onClick={() => setScreen('menu')}>Menu</button>
        </div>
      </div>
    </div>
  );
}
