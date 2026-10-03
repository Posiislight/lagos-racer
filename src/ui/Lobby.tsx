import { useState } from 'react';
import { useGame } from '../game/store';
import { VEHICLES, vehicleById } from '../config/vehicles';
import { ERROR_TEXT, useNet } from '../net/store';

async function shareLink(code: string): Promise<'shared' | 'copied' | 'failed'> {
  const url = `${location.origin}/?room=${code}`;
  try {
    if (navigator.share) {
      await navigator.share({ url });
      return 'shared';
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'failed'; // they closed the share sheet
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export function Lobby() {
  const unlocked = useGame(s => s.unlocked);
  const { status, code, mySlot, room, error, setVehicle, setReady, setFillAI, start, leave } = useNet();
  const [copied, setCopied] = useState(false);
  if (!room || !code) return null;

  const me = room.players.find(p => p.slot === mySlot);
  const isHost = room.hostSlot === mySlot;
  const here = room.players.filter(p => p.connected);
  const canStart = isHost && here.length >= 2 && here.every(p => p.ready);
  const away = status === 'reconnecting';

  const share = async () => {
    const result = await shareLink(code);
    if (result === 'copied') {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="lobby">
      <div className="card lobby-room">
        <p className="eyebrow">Room code</p>
        <p className="room-code" aria-label={`Room code ${code.split('').join(' ')}`}>{code}</p>
        <div className="row">
          <button className="btn" onClick={share}>{copied ? 'Link copied' : 'Share'}</button>
          <button className="btn ghost" onClick={leave}>Leave race</button>
        </div>
        <table className="table">
          <thead><tr><th>Player</th><th>Ride</th><th>Ready</th></tr></thead>
          <tbody>
            {room.players.map(p => {
              const v = vehicleById(p.vehicle);
              return (
                <tr key={p.slot} className={p.slot === mySlot ? 'me' : ''}>
                  <td>{p.name}{p.slot === room.hostSlot && ' (host)'}{!p.connected && <span className="muted"> · reconnecting</span>}</td>
                  <td><span className="dot" style={{ background: v.color }} /> {v.name}</td>
                  <td>{p.ready ? <span className="tick" role="img" aria-label="ready">✓</span> : <span className="muted" aria-label="not ready">–</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="card lobby-controls">
        <p className="eyebrow">Your ride</p>
        <div className="stops lobby-picks" role="tablist" aria-label="Vehicles">
          {VEHICLES.filter(v => !v.locked || unlocked.includes(v.id)).map(v => (
            <button key={v.id} role="tab" aria-selected={me?.vehicle === v.id} onClick={() => setVehicle(v.id)}>
              <span className="dot" style={{ background: v.color }} />{v.name}
            </button>
          ))}
        </div>
        <button className={`btn${me?.ready ? '' : ' primary'}`} aria-pressed={!!me?.ready} onClick={() => setReady(!me?.ready)}>
          {me?.ready ? 'Ready ✓' : 'Ready'}
        </button>
        {isHost && (
          <div className="row lobby-host">
            {/* Filling empty places with AI is not built yet. */}
            <button className="btn" disabled aria-pressed={room.fillAI} onClick={() => setFillAI(!room.fillAI)}>Fill with AI</button>
            <button className="btn primary" disabled={!canStart} onClick={start}>Start</button>
          </div>
        )}
        <p className={`net-note${error || away ? ' bad' : ''}`} role="status">
          {error ? ERROR_TEXT[error] : away ? 'Reconnecting…' : isHost && !canStart ? 'Need two players, everybody ready' : !isHost ? 'Waiting for the host to start' : ''}
        </p>
      </div>
    </div>
  );
}
