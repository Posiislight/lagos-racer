/** How much faster than a remote car it can knock you along, m/s. */
export const REMOTE_PUSH_MARGIN = 3;

/**
 * Another phone's car is kinematic (infinitely heavy here), so touching it can fling you.
 * Cap the horizontal speed at whichever is higher: what you had before the contact, or the
 * remote's speed plus a little. The direction is kept.
 */
export function clampContactSpeed(vx: number, vz: number, before: number, remoteSpeed: number): { vx: number; vz: number } {
  const limit = Math.max(before, remoteSpeed + REMOTE_PUSH_MARGIN);
  const speed = Math.hypot(vx, vz);
  if (speed <= limit) return { vx, vz };
  const k = limit / speed;
  return { vx: vx * k, vz: vz * k };
}
