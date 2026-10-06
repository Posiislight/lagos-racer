import { useEffect, useState } from 'react';
import { BOARD_SIZE } from '../config/leaderboard';
import { TRACKS } from '../config/tracks';
import { vehicleById } from '../config/vehicles';
import { formatTime } from '../game/race';
import type { Row } from '../game/leaderboard';
import { fetchTimes, fetchWeekly, type Board } from '../net/leaderboard';
import { useNet } from '../net/store';

type Tab = 'week' | 'times';

/** The boards, opened from the small trophy button on the Multiplayer screen. Fetched once per tab or track, never polled. */
export function Leaderboard({ onClose }: { onClose: () => void }) {
  const nickname = useNet(s => s.nickname);
  const [tab, setTab] = useState<Tab>('week');
  const [track, setTrack] = useState(TRACKS[0].id);
  // undefined while loading, null when the server could not answer.
  const [board, setBoard] = useState<Board | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    setBoard(undefined);
    (tab === 'week' ? fetchWeekly(nickname) : fetchTimes(track, nickname)).then(b => { if (live) setBoard(b); });
    return () => { live = false; };
  }, [tab, track, nickname]);

  const line = (r: Row, rank: number, me: boolean) => (
    <tr key={`${r.key}${r.seed ? 's' : ''}`} className={me ? 'me' : undefined}>
      <td>{rank}</td>
      <td>{r.name}</td>
      <td>{tab === 'week' ? `${r.value} pts` : `${formatTime(r.value / 1000)}${r.vehicle ? ` · ${vehicleById(r.vehicle).name}` : ''}`}</td>
    </tr>
  );
  const myKey = board?.me?.row.key;

  return (
    <div className="modal lb-modal" role="dialog" aria-modal="true" aria-labelledby="lb-title">
      <div className="card modal-card lb-card">
        <h2 id="lb-title">Leaderboard</h2>
        <div className="seg lb-tabs">
          <label className={tab === 'week' ? 'on' : undefined}>
            <input type="radio" name="lb-tab" checked={tab === 'week'} onChange={() => setTab('week')} /> This week
          </label>
          <label className={tab === 'times' ? 'on' : undefined}>
            <input type="radio" name="lb-tab" checked={tab === 'times'} onChange={() => setTab('times')} /> Best times
          </label>
        </div>
        {tab === 'times' && (
          <select className="lb-track" aria-label="Track" value={track} onChange={e => setTrack(e.target.value)}>
            {TRACKS.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        {board === undefined ? (
          <p className="muted" role="status">Loading…</p>
        ) : board === null ? (
          <p className="muted" role="status">Leaderboard no dey available now</p>
        ) : board.rows.length === 0 ? (
          <p className="muted">Take a Quick play race to get on the board.</p>
        ) : (
          <>
            <div className="lb-scroll">
              <table className="table">
                <tbody>{board.rows.map((r, i) => line(r, i + 1, r.key === myKey))}</tbody>
              </table>
            </div>
            {/* Outside the scrolling list so it stays in view. */}
            {board.me && board.me.rank > BOARD_SIZE && (
              <table className="table lb-me"><tbody>{line(board.me.row, board.me.rank, true)}</tbody></table>
            )}
          </>
        )}
        {tab === 'week' && board?.lastWinner && <p className="muted small">Last week: {board.lastWinner}</p>}
        <button className="btn primary" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
