import { useState } from 'react';
import { useGame } from '../game/store';
import { ERROR_TEXT, useNet } from '../net/store';
import { CODE_ALPHABET, NICK_MAX, normalizeCode } from '../net/protocol';

/** A room code from a ?room= link, or '' if the link has none or a junk one. */
function codeFromUrl(): string {
  const code = normalizeCode(new URLSearchParams(location.search).get('room') ?? '');
  return /^[A-Z]{4}$/.test(code) ? code : '';
}

const onlyCodeLetters = (raw: string) => normalizeCode(raw).split('').filter(c => CODE_ALPHABET.includes(c)).join('').slice(0, 4);

export function Online() {
  const vehicle = useGame(s => s.vehicle);
  const { status, error, nickname, create, join, leave } = useNet();
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
        <button className="btn primary" disabled={busy} onClick={() => create(name, vehicle)}>Create room</button>
        <p className="or" aria-hidden="true">or</p>
        <form className="join-row" onSubmit={e => { e.preventDefault(); join(code, name, vehicle); }}>
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
    </div>
  );
}
