import { useState } from 'react';
import { useGame } from '../game/store';
import { paintOf, vehicleById } from '../config/vehicles';
import { ERROR_TEXT, useNet } from '../net/store';
import { CODE_ALPHABET, NICK_MAX, normalizeCode } from '../net/protocol';
import { Leaderboard } from './Leaderboard';

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
  // A ?room= link goes straight to the friends form; otherwise first choose how to play.
  const [friends, setFriends] = useState(() => codeFromUrl() !== '');
  const [board, setBoard] = useState(false);
  const busy = status === 'connecting' || status === 'reconnecting';
  const nickField = (
    <label className="field">
      <span>Your nickname</span>
      <input value={name} maxLength={NICK_MAX} autoComplete="nickname" placeholder="Odogwu Rider" onChange={e => setName(e.target.value)} />
    </label>
  );
  const note = (
    <p className={`net-note${error ? ' bad' : ''}`} role="status">
      {error ? ERROR_TEXT[error] : busy ? 'Connecting…' : ''}
    </p>
  );
  return (
    <div className="online">
      {friends ? (
        <div className="card online-card">
          <h2>Play with friends</h2>
          <p className="muted">Make a room and send the code, or type the code your friend sent.</p>
          <div className="online-cols">
            <div className="online-col">
              {nickField}
              <button className="btn primary" disabled={busy} onClick={() => create(name, vehicle, paint)}>Create room</button>
            </div>
            <p className="or" aria-hidden="true">or</p>
            <form className="join-row online-col" onSubmit={e => { e.preventDefault(); join(code, name, vehicle, paint); }}>
              <label className="field">
                <span>Room code</span>
                <input className="code-input" value={code} maxLength={4} inputMode="text" autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false}
                  placeholder="ABCD" onChange={e => setCode(onlyCodeLetters(e.target.value))} />
              </label>
              <button className="btn primary" type="submit" disabled={busy}>Join room</button>
            </form>
          </div>
          {note}
          <button className="btn" onClick={() => setFriends(false)}>← Back</button>
        </div>
      ) : (
        <div className="card online-card">
          <button className="lb-btn" onClick={() => setBoard(true)} aria-label="Leaderboard" title="Leaderboard">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
              <path d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" /><path d="M12 14v4M8 20h8" />
            </svg>
          </button>
          <h2>Multiplayer</h2>
          <div className="online-cols">
            <div className="online-col">{nickField}</div>
            <div className="online-col">
              <button className="entry primary" disabled={busy} onClick={() => quick(name, vehicle, paint)}>
                <b>QUICK PLAY</b>
                <span>Jump in and race whoever is online now.</span>
              </button>
              <button className="entry" disabled={busy} onClick={() => setFriends(true)}>
                <b>PLAY WITH FRIENDS</b>
                <span>Make a room and share the code.</span>
              </button>
            </div>
          </div>
          {note}
          <button className="btn" onClick={leave}>← Back</button>
        </div>
      )}
      {board && <Leaderboard onClose={() => setBoard(false)} />}
      {cut && <ConnectionCut />}
    </div>
  );
}
