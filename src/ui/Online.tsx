import { useState } from 'react';
import { useGame } from '../game/store';
import { paintOf, vehicleById } from '../config/vehicles';
import { ERROR_TEXT, useNet } from '../net/store';
import { CODE_ALPHABET, NICK_MAX, normalizeCode } from '../net/protocol';

/** A room code from a ?room= link, or '' if the link has none or a junk one. */
function codeFromUrl(): string {
  const code = normalizeCode(new URLSearchParams(location.search).get('room') ?? '');
  return /^[A-Z]{4}$/.test(code) ? code : '';
}

/** The room is gone for good (the server went away, or we were away too long): only the menu is left. */
export function ConnectionCut() {
  const backToMenu = () => { useNet.getState().leave(); useGame.getState().quitRace(); };
  return (
    <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="cut-title">
      <div className="card modal-card">
        <h2 id="cut-title">Connection don cut</h2>
        <p className="muted">We no fit reach the room again.</p>
        <button className="btn primary" onClick={backToMenu}>Back to menu</button>
      </div>
    </div>
  );
}

const onlyCodeLetters = (raw: string) => normalizeCode(raw).split('').filter(c => CODE_ALPHABET.includes(c)).join('').slice(0, 4);

export function Online() {
  const vehicle = useGame(s => s.vehicle);
  // Your ride goes to the room in the paint you picked for it in the garage.
  const paint = useGame(s => paintOf(vehicleById(s.vehicle), s.paint[s.vehicle]).id);
  const { status, error, cut, nickname, create, quick, join, leave } = useNet();
  const [name, setName] = useState(nickname);
  const [code, setCode] = useState(codeFromUrl);
  const busy = status === 'connecting' || status === 'reconnecting';
  return (
    <div className="online">
      <div className="card online-card">
        <h2>Race with friends</h2>
        <p className="muted">Make a room and send the code, or type the code your friend sent.</p>
        <label className="field">
          <span>Your nickname</span>
          <input value={name} maxLength={NICK_MAX} autoComplete="nickname" placeholder="Odogwu Rider" onChange={e => setName(e.target.value)} />
        </label>
        <button className="btn primary" disabled={busy} onClick={() => quick(name, vehicle, paint)}>Quick race</button>
        <p className="muted">Race whoever is online now. Bots fill any empty seats.</p>
        <button className="btn" disabled={busy} onClick={() => create(name, vehicle, paint)}>Create room</button>
        <p className="or" aria-hidden="true">or</p>
        <form className="join-row" onSubmit={e => { e.preventDefault(); join(code, name, vehicle, paint); }}>
          <label className="field">
            <span>Room code</span>
            <input className="code-input" value={code} maxLength={4} inputMode="text" autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false}
              placeholder="ABCD" onChange={e => setCode(onlyCodeLetters(e.target.value))} />
          </label>
          <button className="btn primary" type="submit" disabled={busy}>Join room</button>
        </form>
        <p className={`net-note${error ? ' bad' : ''}`} role="status">
          {error ? ERROR_TEXT[error] : busy ? 'Connecting…' : ''}
        </p>
        <button className="btn" onClick={leave}>← Back</button>
      </div>
      {cut && <ConnectionCut />}
    </div>
  );
}
