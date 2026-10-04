import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { getRace } from '../game/runtime';
import { fx, resetFx } from '../game/fx';
import type { Quality } from '../game/save';

const _p = new Vector3();

/** Feeds the screen effects from the player's racer: boost, juju hits, oil, cough, and pickups. */
export function FxBridge({ quality }: { quality: Quality }) {
  const { camera, gl } = useThree();
  const prev = useRef({ curse: 0, item: null as string | null });
  useEffect(() => { resetFx(); fx.quality = quality; return resetFx; }, [quality]);

  useFrame((_, dtRaw) => {
    const race = getRace(), p = race?.racers.find(r => r.isPlayer);
    if (!p) return;
    const dt = Math.min(dtRaw, 0.05), s = prev.current;
    // Ease in over a quarter of a second, out over 0.4 s.
    fx.boost = p.boost > 0 ? Math.min(1, fx.boost + dt / 0.25) : Math.max(0, fx.boost - dt / 0.4);
    fx.slip = p.slip > 0 ? Math.min(1, fx.slip + dt / 0.2) : Math.max(0, fx.slip - dt / 0.5);
    fx.cough = p.cough > 0 ? Math.min(1, fx.cough + dt / 0.2) : Math.max(0, fx.cough - dt / 0.5);
    fx.juju = p.curse > s.curse + 0.5 ? 0 : fx.juju + dt;
    s.curse = p.curse;
    if (p.item && !s.item && p.visual) {
      // Where the player is on screen is where the item was grabbed.
      p.visual.getWorldPosition(_p).project(camera);
      const el = gl.domElement;
      fx.pickups.push({ kind: p.item, x: (_p.x + 1) / 2 * el.clientWidth, y: (1 - _p.y) / 2 * el.clientHeight - 40 });
    }
    s.item = p.item;
  });
  return null;
}
