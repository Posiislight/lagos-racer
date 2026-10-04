import { useState } from 'react';
import { useGame } from '../game/store';
import { Settings } from './Settings';

export function PauseMenu() {
  const { setPaused, startRace, quitRace } = useGame();
  const [settings, setSettings] = useState(false);
  if (settings) return <Settings onClose={() => setSettings(false)} />;
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="pause-title">
      <div className="card modal-card">
        <h2 id="pause-title">Paused</h2>
        <p className="muted">Take am easy. The danfo go wait.</p>
        <div className="col">
          <button className="btn primary" onClick={() => setPaused(false)}>Resume</button>
          <button className="btn" onClick={() => startRace(useGame.getState().spec ?? undefined)}>Restart race</button>
          <button className="btn" onClick={() => setSettings(true)}>Settings</button>
          <button className="btn ghost" onClick={quitRace}>Quit to menu</button>
        </div>
      </div>
    </div>
  );
}
