import { useEffect, useState, type PointerEvent, type ReactNode } from 'react';
import { touch } from '../game/input';
import { useGame } from '../game/store';

type Key = keyof typeof touch;

export function useIsTouch() {
  const [isTouch, setTouch] = useState(() => typeof window !== 'undefined' && (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0));
  useEffect(() => {
    const on = () => setTouch(true);
    window.addEventListener('touchstart', on, { once: true });
    return () => window.removeEventListener('touchstart', on);
  }, []);
  return isTouch;
}

/** A hold-to-press button that works with several fingers at once. */
function Pad({ k, className, label, children }: { k: Key; className: string; label: string; children: ReactNode }) {
  const [down, setDown] = useState(false);
  const press = (on: boolean) => (e: PointerEvent) => {
    e.preventDefault();
    if (on) (e.target as Element).setPointerCapture?.(e.pointerId);
    touch[k] = on;
    setDown(on);
  };
  return (
    <button
      className={`pad ${className}${down ? ' down' : ''}`}
      aria-label={label}
      onPointerDown={press(true)}
      onPointerUp={press(false)}
      onPointerCancel={press(false)}
      onLostPointerCapture={() => { touch[k] = false; setDown(false); }}
      onContextMenu={e => e.preventDefault()}
    >
      {children}
    </button>
  );
}

/**
 * Phone controls: you're always on the gas, so it's just left (left thumb) and right (right
 * thumb), or tilt the phone. The power-up button is part of the HUD, mid-right above your right thumb.
 */
export function TouchControls() {
  const tilt = useGame(s => s.settings.steering === 'tilt');
  return (
    <div className="touch">
      {!tilt && <div className="touch-left"><Pad k="left" className="steer" label="Steer left">◀</Pad></div>}
      <div className="touch-right">
        <div className="touch-row small">
          <Pad k="horn" className="mini" label="Horn">PON PON</Pad>
        </div>
        {!tilt && <Pad k="right" className="steer" label="Steer right">▶</Pad>}
      </div>
    </div>
  );
}
