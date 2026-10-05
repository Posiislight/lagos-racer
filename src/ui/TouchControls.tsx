import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { touch } from '../game/input';
import { useGame } from '../game/store';

export function useIsTouch() {
  const [isTouch, setTouch] = useState(() => typeof window !== 'undefined' && (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0));
  useEffect(() => {
    const on = () => setTouch(true);
    window.addEventListener('touchstart', on, { once: true });
    return () => window.removeEventListener('touchstart', on);
  }, []);
  return isTouch;
}

const STEER_R = 44; // half the steer button's size, keeps it fully on screen

/**
 * Floating steer button: touching anywhere in this half of the screen steers that way and moves
 * the button under your thumb (like Beach Buggy). It goes back to its corner when you let go.
 */
function SteerZone({ k, side, label, children }: { k: 'left' | 'right'; side: 'left' | 'right'; label: string; children: ReactNode }) {
  const fingers = useRef(new Set<number>());
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [down, setDown] = useState(false);

  const place = (e: PointerEvent) => {
    const box = (e.currentTarget as HTMLElement).parentElement!.getBoundingClientRect();
    const clamp = (v: number, max: number) => Math.max(STEER_R, Math.min(max - STEER_R, v));
    setPos({ x: clamp(e.clientX - box.left, box.width), y: clamp(e.clientY - box.top, box.height) });
  };
  const release = (e: PointerEvent) => {
    fingers.current.delete(e.pointerId);
    if (fingers.current.size === 0) { touch[k] = false; setDown(false); setPos(null); }
  };

  return (
    <>
      <div
        className={`touch-zone ${side}`}
        aria-label={label}
        onPointerDown={e => {
          e.preventDefault();
          try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
          fingers.current.add(e.pointerId);
          touch[k] = true;
          setDown(true);
          place(e);
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
        onContextMenu={e => e.preventDefault()}
      />
      <div
        className={`pad steer floating ${side}${down ? ' down' : ''}`}
        style={pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : undefined}
        aria-hidden
      >
        {children}
      </div>
    </>
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
      {!tilt && <SteerZone k="left" side="left" label="Steer left">◀</SteerZone>}
      {!tilt && <SteerZone k="right" side="right" label="Steer right">▶</SteerZone>}
    </div>
  );
}
