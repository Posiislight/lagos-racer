/**
 * Bumper-car shoves: when two vehicles touch, each is pushed away from the other. The push is at
 * least MIN_SHOVE (so a gentle lean still separates them) or a share of the closing speed, and the
 * lighter vehicle takes most of it: an okada hit by a BRT is thrown aside, a BRT hit by an okada
 * barely notices. Each car works out its own shove, so this needs nothing from the other car's
 * physics beyond its position, velocity and mass (which also suits remote cars online).
 */
export type BumpBody = { x: number; z: number; vx: number; vz: number; mass: number };

const MIN_SHOVE = 3; // m/s
const RESTITUTION = 0.6;

/** Velocity change (x, z) for `own` from touching `other`. */
export function bumpShove(own: BumpBody, other: BumpBody): { x: number; z: number } {
  let dx = own.x - other.x, dz = own.z - other.z, d = Math.hypot(dx, dz);
  if (d < 1e-6) {
    // Same spot: push out sideways from our own direction of travel.
    const v = Math.hypot(own.vx, own.vz);
    [dx, dz] = v > 1e-6 ? [-own.vz / v, own.vx / v] : [1, 0];
    d = 1;
  }
  dx /= d; dz /= d;
  const closing = Math.max(0, -((own.vx - other.vx) * dx + (own.vz - other.vz) * dz));
  const speed = Math.max(MIN_SHOVE, RESTITUTION * closing) * (other.mass / (other.mass + own.mass));
  return { x: dx * speed, z: dz * speed };
}
