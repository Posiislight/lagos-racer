import { useGame, type Result } from '../game/store';
import { formatTime } from '../game/race';
import { vehicleById } from '../config/vehicles';
import { driverById } from '../config/drivers';
import { nextRace } from '../game/campaign';

const PLACE = ['1st', '2nd', '3rd', '4th', '5th', '6th'];
const CHEER = ['Oga at the top! 🏆', 'Second place no bad o!', 'Third. You fit do better.', 'Last? Na wa o. Try again!'];

/** The time column: when a racer was clamped, that they are still in (elimination), or their finish. */
function timeCell(r: Result, elimination: boolean) {
  if (r.out !== null) return `out ${formatTime(r.out)}`;
  if (r.time === null) return elimination ? 'Still in' : 'DNF';
  return (r.projected ? '~' : '') + formatTime(r.time);
}

export function Results() {
  const { results, spec, outcome, coinsEarned, startRace, setScreen, setDriver, showAccountPrompt, dismissAccountPrompt } = useGame();
  if (!results) return null;
  const place = results.findIndex(r => r.isPlayer);
  const elimination = spec?.mode.kind === 'elimination';
  const clamped = elimination && results[place].out !== null;
  const heading = clamped ? 'Eliminated' : `${PLACE[place]} place`;
  const cheer = clamped ? 'Clamped by LASTMA!'
    : spec?.taunts && outcome ? (outcome.passed ? spec.taunts.lose : spec.taunts.win)
    : CHEER[Math.min(place, CHEER.length - 1)];
  const next = spec && outcome?.passed ? nextRace(spec) : null;
  const unlocked = outcome?.unlocked ? driverById(outcome.unlocked) : null;
  return (
    <div className="modal results" role="dialog" aria-modal="true" aria-labelledby="results-title">
      <div className="card modal-card wide">
        <p className="eyebrow">{spec?.title ?? 'Ojuelegba Grand Prix'}</p>
        <div className="result-head">
          <h2 id="results-title">{heading}</h2>
          {outcome && <span className={`verdict ${outcome.passed ? 'passed' : 'failed'}`}>{outcome.passed ? 'Passed' : 'Try again'}</span>}
        </div>
        <p className="cheer">{cheer}</p>
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
        <p className="earned">+ ₦ {coinsEarned} coins{outcome?.firstClear && spec ? ` (includes ₦ ${spec.firstClearCoins} first-clear bonus)` : ''}</p>
        {unlocked && (
          <div className="unlocked">
            <p><b>{unlocked.name} unlocked!</b> Now playable from the Garage.</p>
            <button className="btn primary" onClick={() => { setDriver(unlocked.id); setScreen('campaign'); }}>Use her</button>
          </div>
        )}
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
          {spec ? (
            <>
              {next && <button className="btn primary" onClick={() => startRace(next)}>Next race</button>}
              <button className={`btn${next ? '' : ' primary'}`} onClick={() => startRace(spec)}>Retry</button>
              <button className="btn" onClick={() => setScreen('campaign')}>Campaign</button>
            </>
          ) : (
            <>
              <button className="btn primary" onClick={() => startRace()}>Race again</button>
              <button className="btn" onClick={() => setScreen('garage')}>Garage</button>
              <button className="btn" onClick={() => setScreen('menu')}>Menu</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
