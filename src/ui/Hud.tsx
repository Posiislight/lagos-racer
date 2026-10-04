import { useEffect, useRef, type CSSProperties } from 'react';
import { useGame } from '../game/store';
import { formatTime } from '../game/race';
import { getRace } from '../game/runtime';
import { queueItem, queueSpecial } from '../game/input';
import { useIsTouch } from './TouchControls';
import { ITEM_ICON } from '../scene/art/items';

const suffix = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th');

export function Hud({ onPause }: { onPause: () => void }) {
  const hud = useGame(s => s.hud);
  const best = useGame(s => s.best[s.track]);
  const isTouch = useIsTouch();
  if (hud.phase === 'loading') return null;
  return (
    <div className="hud">
      <div className="hud-pos" aria-label={`Position ${hud.position} of ${hud.racers}`}>
        <b>{hud.position}</b><sup>{suffix(hud.position)}</sup><span>/{hud.racers}</span>
      </div>
      <ProgressLine lap={hud.lap} laps={hud.laps} />
      <div className="hud-lap">
        <div className="time">{formatTime(hud.time)}</div>
        <div className="best">Best lap {formatTime(hud.bestLap ?? best ?? null)}</div>
      </div>
      {/* The power-up button: middle of the right-hand side, under your right thumb. */}
      <button className={`hud-item${hud.item ? ' full' : ''}`} onPointerDown={e => { e.preventDefault(); queueItem(); }} aria-label={hud.item ? `Use ${hud.item.label}` : 'No item'}>
        {hud.item ? <img className="icon-img" src={ITEM_ICON[hud.item.kind]} alt="" /> : <span className="icon dim">USE</span>}
      </button>
      {/* The special button: left of the power-up button. The ring fills as the meter charges. */}
      <button
        className={`hud-special${hud.special.ready ? ' ready' : ''}`} style={{ '--charge': hud.special.charge } as CSSProperties}
        onPointerDown={e => { e.preventDefault(); queueSpecial(); }}
        aria-label={`Special: ${hud.special.name}${hud.special.ready ? ', ready' : ''}`}
      >
        <span className="face">{hud.special.name.split(' ')[0]}</span>
        {!isTouch && <kbd>Q</kbd>}
      </button>
      <button className="hud-pause" onClick={onPause} aria-label="Pause">II</button>
      <div className="hud-speed"><b>{Math.round(hud.speed)}</b> km/h</div>
      {hud.countdown && <div className={`hud-count${hud.countdown.length > 1 ? ' go' : ''}`} key={`count-${hud.countdown}`}>{hud.countdown}</div>}
      {hud.message && <Message text={hud.message} key={`msg-${hud.messageKey}`} />}
      {hud.wrongWay && <div className="hud-wrong">WRONG WAY! TURN AM!</div>}
    </div>
  );
}

/** A flashed message. "JUJU! Press Space to…" shows the shout big and the how-to underneath, smaller. */
function Message({ text }: { text: string }) {
  const i = text.indexOf('! ');
  if (i < 0 || text.length <= 16) return <div className="hud-msg">{text}</div>;
  return <div className="hud-msg long"><b>{text.slice(0, i + 1)}</b><small>{text.slice(i + 2)}</small></div>;
}

/**
 * The lap as a straight line across the top of the screen, start on the left, with a dot per racer
 * at how far round the lap they are. Updated every frame without re-rendering React.
 */
function ProgressLine({ lap, laps }: { lap: number; laps: number }) {
  const track = useRef<HTMLDivElement>(null);
  const race = getRace();

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const r = getRace(), el = track.current;
      if (r && el) {
        const L = r.track.length;
        r.racers.forEach((c, i) => {
          const dot = el.querySelector<HTMLElement>(`[data-i="${i}"]`);
          if (!dot) return;
          // Finished racers sit at the end; everyone else at their distance into the current lap.
          const done = c.progress.finishTime !== null;
          const frac = done ? 1 : (((c.progress.distance % L) + L) % L) / L;
          dot.style.left = `${(frac * 100).toFixed(2)}%`;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!race) return null;
  return (
    <div className="hud-progress" aria-label={`Lap ${lap} of ${laps}`}>
      <div className="lap">LAP <b>{lap}</b>/{laps}</div>
      <div className="line" ref={track} aria-hidden="true">
        <span className="flag" />
        {/* Player last so their dot draws on top. */}
        {race.racers.map((c, i) => ({ c, i })).sort((a, b) => Number(a.c.isPlayer) - Number(b.c.isPlayer)).map(({ c, i }) => (
          <i key={i} data-i={i} className={c.isPlayer ? 'me' : ''} style={{ background: c.isPlayer ? '#ffffff' : c.paint.color }} />
        ))}
      </div>
    </div>
  );
}
