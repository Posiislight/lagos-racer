import { useEffect, useState } from 'react';
import { TRACKS } from '../config/tracks';
import { useGame } from '../game/store';
import { VEHICLES, paintOf, vehicleById } from '../config/vehicles';
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

/** Whole seconds left, counted down locally from when the last room message arrived; never negative. */
function useCountdown(startsInMs: number | undefined, arrivedAt: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (startsInMs === undefined) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [startsInMs, arrivedAt]);
  return startsInMs === undefined ? 0 : Math.max(0, Math.ceil((startsInMs - (now - arrivedAt)) / 1000));
}

export function Lobby() {
  const unlocked = useGame(s => s.unlocked);
  const paints = useGame(s => s.paint);
  const { status, code, mySlot, room, roomAt, myVote, error, vote, setVehicle, setReady, setFillAI, start, leave } = useNet();
  const [copied, setCopied] = useState(false);
  const seconds = useCountdown(room?.quick?.startsInMs, roomAt);
  if (!room || !code) return null;

  const me = room.players.find(p => p.slot === mySlot);
  const isHost = room.hostSlot === mySlot;
  const here = room.players.filter(p => p.connected);
  const canStart = isHost && here.length >= 2 && here.every(p => p.ready);
  const away = status === 'reconnecting';
  // Back from a drop while the others race on without us.
  const inRace = room.phase !== 'lobby';

  const share = async () => {
    const result = await shareLink(code);
    if (result === 'copied') {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const quick = room.quick;
  if (quick) {
    const racing = room.phase !== 'lobby';
    return (
      <div className="lobby">
        <div className="card lobby-room">
          <p className="eyebrow">Quick race</p>
          <p className="quick-title">{racing ? 'Race don start' : 'Looking for racers…'}</p>
          {!racing && <p className="quick-count" role="timer" aria-label={`Race starts in ${seconds} seconds`}>{seconds}s</p>}
          <button className="btn ghost" onClick={leave}>Leave</button>
          <table className="table">
            <thead><tr><th>Player</th><th>Ride</th></tr></thead>
            <tbody>
              {room.players.map(p => {
                const v = vehicleById(p.vehicle);
                return (
                  <tr key={p.slot} className={p.slot === mySlot ? 'me' : ''}>
                    <td>{p.name}{!p.connected && <span className="muted"> · reconnecting</span>}</td>
                    <td><span className="dot" style={{ background: paintOf(v, p.paint).color }} /> {v.name}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="card lobby-controls">
          <p className="eyebrow">Vote for a track</p>
          <div className="quick-votes" role="radiogroup" aria-label="Track vote">
            {TRACKS.map(t => (
              <button key={t.id} role="radio" aria-checked={myVote === t.id} className={`btn quick-vote${myVote === t.id ? ' on' : ''}`} disabled={racing} onClick={() => vote(t.id)}>
                <span>{t.name}</span><b>{quick.votes[t.id] ?? 0}</b>
              </button>
            ))}
          </div>
          <p className="eyebrow">Your ride</p>
          <div className="stops lobby-picks" role="tablist" aria-label="Vehicles">
            {VEHICLES.filter(v => !v.locked || unlocked.includes(v.id)).map(v => {
              const paint = paintOf(v, paints[v.id]);
              return (
                <button key={v.id} role="tab" aria-selected={me?.vehicle === v.id} disabled={racing} onClick={() => setVehicle(v.id, paint.id)}>
                  <span className="dot" style={{ background: paint.color }} />{v.name}
                </button>
              );
            })}
          </div>
          <p className={`net-note${error || away ? ' bad' : ''}`} role="status">
            {error ? ERROR_TEXT[error] : away ? 'Reconnecting…' : racing ? 'Race in progress' : ''}
          </p>
        </div>
      </div>
    );
  }

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
                  <td><span className="dot" style={{ background: paintOf(v, p.paint).color }} /> {v.name}</td>
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
          {VEHICLES.filter(v => !v.locked || unlocked.includes(v.id)).map(v => {
            // Each ride in the paint picked for it in the garage.
            const paint = paintOf(v, paints[v.id]);
            return (
              <button key={v.id} role="tab" aria-selected={me?.vehicle === v.id} onClick={() => setVehicle(v.id, paint.id)}>
                <span className="dot" style={{ background: paint.color }} />{v.name}
              </button>
            );
          })}
        </div>
        <button className={`btn${me?.ready ? ' ready' : ' primary'}`} aria-pressed={!!me?.ready} disabled={inRace} onClick={() => setReady(!me?.ready)}>
          Ready
        </button>
        {isHost && (
          <div className="row lobby-host">
            <button className="btn" aria-pressed={room.fillAI} onClick={() => setFillAI(!room.fillAI)}>Fill with AI</button>
            <button className="btn primary" disabled={!canStart} onClick={start}>Start</button>
          </div>
        )}
        <p className={`net-note${error || away ? ' bad' : ''}`} role="status">
          {error ? ERROR_TEXT[error]
            : away ? 'Reconnecting…'
            : inRace ? 'Race in progress, you go join the next one.'
            : isHost && !canStart ? 'Need two players, everybody ready'
            : !isHost ? 'Waiting for the host to start' : ''}
        </p>
      </div>
    </div>
  );
}
