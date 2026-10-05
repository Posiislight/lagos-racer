import type { Quality } from './save';

/**
 * Adaptive graphics quality. The race starts on the saved level (High for a new player on a normal
 * phone) and steps down one level at a time when the frame rate stays low. It never steps back up, so
 * the picture can't flicker between levels. The measuring is `FpsGovernor` (plain logic, no WebGL);
 * `scene/AdaptiveQuality.tsx` feeds it frames and writes the new level into the settings, and the scene
 * follows from there. What each level means is `PROFILES`, the one table the scene reads.
 */

// Tunables.
/** Below this many frames per second a window counts as slow. */
export const TARGET_FPS = 40;
/** Frames are averaged over windows this long. */
export const WINDOW_MS = 1000;
/** Slow windows in a row (this many seconds' worth) before dropping a level. */
export const LOW_STREAK_SECONDS = 3;
/** Nothing counts this long after the race loads: shader compiling and asset loading look like a slow device. */
export const GRACE_PERIOD_MS = 5000;
/** Nothing counts this long after a level change: the change itself costs a few frames. */
export const COOLDOWN_MS = 3000;
/** A gap this long between two frames is a hidden tab, a debugger or a one-off freeze, not a steady slow rate. */
const STALL_MS = 2000;

/** Best first. */
export const LEVELS: readonly Quality[] = ['high', 'medium', 'low'];

export type Profile = {
  /** Pixel ratio range (R3F clamps the device's pixel ratio into it). */
  dpr: [number, number];
  /** Shadow map size in pixels; 0 turns shadows off. */
  shadowMap: number;
  /** Camera far plane; the fog and the painted skyline follow it. */
  far: number;
  /** Scenery and prop count, 1 = full. */
  density: number;
  /** Share of the juju trail and puff particles drawn, 1 = all. */
  particles: number;
  animateWater: boolean;
};

export const PROFILES: Record<Quality, Profile> = {
  low: { dpr: [1, 1], shadowMap: 0, far: 170, density: 0.5, particles: 0.4, animateWater: false },
  medium: { dpr: [1, 1.25], shadowMap: 1024, far: 230, density: 0.8, particles: 0.7, animateWater: true },
  high: { dpr: [1, 2], shadowMap: 2048, far: 300, density: 1, particles: 1, animateWater: true },
};

/** The next level down, or null on Low. */
export function lowerQuality(q: Quality): Quality | null {
  return LEVELS[LEVELS.indexOf(q) + 1] ?? null;
}

type Hardware = { hardwareConcurrency?: number; deviceMemory?: number };

/**
 * Where a first-time player starts: Medium on a clearly weak device (2 GB of memory or less, or two
 * cores or fewer), High otherwise. Only a hint, so a wrong guess costs a few seconds. Safari reports
 * neither value and gets High.
 */
export function startQuality(hw: Hardware = typeof navigator !== 'undefined' ? navigator as Hardware : {}): Quality {
  const weak = (hw.deviceMemory !== undefined && hw.deviceMemory <= 2) || (hw.hardwareConcurrency !== undefined && hw.hardwareConcurrency <= 2);
  return weak ? 'medium' : 'high';
}

/** Measures the frame rate from frame timestamps and says when to drop a level. */
export class FpsGovernor {
  /** Frames per second over the last complete window (0 before the first). */
  fps = 0;
  /** Slow windows in a row so far. */
  streak = 0;
  private windowStart = -1;
  private frames = 0;
  private lastTs = -1;
  private graceUntil = -1;
  private holdUntil = 0;

  /** True while the grace period or a cooldown is still running at `ts`. */
  waiting(ts: number): boolean { return ts < Math.max(this.graceUntil, this.holdUntil); }

  /** Feed every frame's timestamp (ms, the rAF clock). Returns true when the quality should drop one level. */
  frame(ts: number): boolean {
    if (this.graceUntil < 0) this.graceUntil = ts + GRACE_PERIOD_MS;
    if (this.lastTs >= 0 && ts - this.lastTs > STALL_MS) this.restart();
    this.lastTs = ts;
    // The first frame only starts a window; the frames after it are what the window counts.
    if (this.windowStart < 0) { this.windowStart = ts; return false; }
    this.frames++;
    const elapsed = ts - this.windowStart;
    if (elapsed < WINDOW_MS) return false;

    this.fps = this.frames * 1000 / elapsed;
    // A window counts only if it began after the grace period and any cooldown.
    const counts = this.windowStart >= Math.max(this.graceUntil, this.holdUntil);
    this.windowStart = ts; this.frames = 0;
    if (!counts) { this.streak = 0; return false; }
    // One slow window is a hiccup; only an unbroken run of them is a slow device.
    this.streak = this.fps < TARGET_FPS ? this.streak + 1 : 0;
    if (this.streak < Math.ceil(LOW_STREAK_SECONDS * 1000 / WINDOW_MS)) return false;
    this.settle(ts);
    return true;
  }

  /** The level changed (by this governor or by the player): start over and sit out the cooldown. */
  settle(ts: number) {
    this.restart();
    this.holdUntil = ts + COOLDOWN_MS;
  }

  private restart() {
    this.windowStart = -1; this.frames = 0; this.streak = 0;
  }
}

/** Live numbers for the ?debug=1 overlay, written by the scene and read by the overlay. A plain object, like `fx`. */
export const debugStats = { fps: 0, streak: 0, waiting: true, calls: 0, triangles: 0, geometries: 0, textures: 0, dpr: 1 };

export const DEBUG_OVERLAY = typeof location !== 'undefined' && new URLSearchParams(location.search).get('debug') === '1';
