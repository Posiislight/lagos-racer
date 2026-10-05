import { useState } from 'react';
import { useGame } from '../game/store';
import { useNet } from '../net/store';
import { Settings } from './Settings';

export function PauseMenu() {
  const { setPaused, startRace, quitRace, online } = useGame();
  const [settings, setSettings] = useState(false);
  if (settings) return <Settings onClose={() => setSettings(false)} />;
  const leaveRace = () => { useNet.getState().leave(); quitRace(); };
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="pause-title">
      <div className="card modal-card">
        <h2 id="pause-title">Paused</h2>
        <p className="muted">{online ? 'The race no dey wait o. Your car still dey road.' : 'Take am easy. The danfo go wait.'}</p>
        <div className="col">
          <button className="btn primary" onClick={() => setPaused(false)}>Resume</button>
          {!online && useGame.getState().spec && <button className="btn" onClick={() => startRace(useGame.getState().spec!)}>Restart race</button>}
          <button className="btn" onClick={() => setSettings(true)}>Settings</button>
          {online
            ? <button className="btn ghost" onClick={leaveRace}>Leave race</button>
            : <button className="btn ghost" onClick={quitRace}>Quit to menu</button>}
        </div>
      </div>
    </div>
  );
}
