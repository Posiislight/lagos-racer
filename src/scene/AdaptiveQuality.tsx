import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { DEBUG_OVERLAY, FpsGovernor, debugStats, lowerQuality } from '../game/adaptiveQuality';
import { useGame, type Quality } from '../game/store';

/**
 * Sets the graphics level. Every level-dependent part of the scene (pixel ratio, shadows, draw distance,
 * scenery and particle counts) reads the level from the settings, so changing it there is all that is
 * needed to apply it while the race runs.
 */
export function applyQuality(level: Quality) {
  useGame.getState().setSetting('quality', level);
}

/** Watches the frame rate inside the render loop and lowers the quality when the device can't keep up. */
export function AdaptiveQuality() {
  const governor = useRef(new FpsGovernor());
  const quality = useGame(s => s.settings.quality);
  const auto = useGame(s => s.settings.autoQuality);

  // A change of level (ours or the player's) or of mode: measure afresh after the cooldown.
  useEffect(() => { governor.current.settle(performance.now()); }, [quality, auto]);

  useFrame(({ gl }) => {
    const g = governor.current;
    const drop = g.frame(performance.now());
    if (DEBUG_OVERLAY) {
      // three resets its counters at the start of each render, so this is the previous frame's.
      const i = gl.info;
      debugStats.fps = g.fps; debugStats.streak = g.streak; debugStats.waiting = g.waiting(performance.now());
      debugStats.calls = i.render.calls; debugStats.triangles = i.render.triangles;
      debugStats.geometries = i.memory.geometries; debugStats.textures = i.memory.textures;
      debugStats.dpr = gl.getPixelRatio();
    }
    if (!drop) return;
    const s = useGame.getState().settings, next = lowerQuality(s.quality);
    if (s.autoQuality && next) applyQuality(next);
  });
  return null;
}
