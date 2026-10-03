import { useEffect, useMemo, useRef } from 'react';
import { useGame } from '../game/store';
import { formatTime } from '../game/race';
import { getRace } from '../game/runtime';
import { queueItem } from '../game/input';
import { ITEM_ICON } from '../scene/art/items';

const suffix = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th');

export function Hud({ onPause }: { onPause: () => void }) {
  const hud = useGame(s => s.hud);
  const best = useGame(s => s.best[s.track]);
  if (hud.phase === 'loading') return null;
  return (
    <div className="hud">
      <div className="hud-pos" aria-label={`Position ${hud.position} of ${hud.racers}`}>
        <b>{hud.position}</b><sup>{suffix(hud.position)}</sup><span>/{hud.racers}</span>
      </div>
      <div className="hud-lap">
        <div className="lap">LAP <b>{hud.lap}</b>/{hud.laps}</div>
        <div className="time">{formatTime(hud.time)}</div>
        <div className="best">Best lap {formatTime(hud.bestLap ?? best ?? null)}</div>
        <Minimap />
      </div>
      <button className={`hud-item${hud.item ? ' full' : ''}`} onPointerDown={e => { e.preventDefault(); queueItem(); }} aria-label={hud.item ? `Use ${hud.item.label}` : 'No item'}>
        {hud.item ? <img className="icon-img" src={ITEM_ICON[hud.item.kind]} alt="" /> : <span className="icon dim">–</span>}
      </button>
      <button className="hud-pause" onClick={onPause} aria-label="Pause">II</button>
      <div className="hud-speed"><b>{Math.round(hud.speed)}</b> km/h</div>
      {hud.countdown && <div className={`hud-count${hud.countdown === 'OYA GO!' ? ' go' : hud.countdown.length > 1 ? ' wait' : ''}`} key={hud.countdown}>{hud.countdown}</div>}
      {hud.message && <div className="hud-msg" key={hud.messageKey}>{hud.message}</div>}
      {hud.wrongWay && <div className="hud-wrong">WRONG WAY! TURN AM!</div>}
    </div>
  );
}

/** Track outline with a dot per racer, redrawn every frame without re-rendering React. */
function Minimap() {
  const svg = useRef<SVGSVGElement>(null);
  const race = getRace();
  const shape = useMemo(() => {
    if (!race) return null;
    const pts = race.track.points.filter((_, i) => i % 3 === 0);
    const xs = pts.map(p => p.pos.x), zs = pts.map(p => p.pos.z);
    const minX = Math.min(...xs), minZ = Math.min(...zs), w = Math.max(...xs) - minX, h = Math.max(...zs) - minZ, pad = 14;
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${(p.pos.x - minX).toFixed(0)} ${(p.pos.z - minZ).toFixed(0)}`).join(' ') + 'Z';
    return { path, viewBox: `${-pad} ${-pad} ${(w + pad * 2).toFixed(0)} ${(h + pad * 2).toFixed(0)}`, minX, minZ };
  }, [race]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const r = getRace(), el = svg.current;
      if (r && el && shape) {
        r.racers.forEach((c, i) => {
          const dot = el.querySelector<SVGCircleElement>(`[data-i="${i}"]`);
          if (!dot || !c.body) return;
          const t = c.body.translation();
          dot.setAttribute('cx', (t.x - shape.minX).toFixed(1));
          dot.setAttribute('cy', (t.z - shape.minZ).toFixed(1));
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [shape]);

  if (!race || !shape) return null;
  return (
    <svg ref={svg} className="minimap" viewBox={shape.viewBox} aria-hidden="true">
      <path d={shape.path} fill="none" stroke="rgba(20,18,16,.75)" strokeWidth="22" strokeLinejoin="round" />
      <path d={shape.path} fill="none" stroke="#f3efe4" strokeWidth="9" strokeLinejoin="round" />
      {race.racers.map((c, i) => (
        <circle key={i} data-i={i} r={c.isPlayer ? 13 : 10} fill={c.isPlayer ? '#ffffff' : c.vehicle.color} stroke="#141210" strokeWidth={c.isPlayer ? 6 : 4} />
      ))}
    </svg>
  );
}
