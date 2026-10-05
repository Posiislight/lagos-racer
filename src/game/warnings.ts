import type { RaceRuntime } from './runtime';
import { isIn } from './modes';
import { Loop } from './audio';
import { jujuWarning } from './audioLogic';

/** The eerie hum of a juju that is flying at the player: louder, higher and panned towards it, so you hear it coming. */
let hum: Loop | null = null;

/** The nearest juju aimed at the local player, as a distance and an angle from straight ahead (positive = to the left). */
export function nearestJujuAtPlayer(race: RaceRuntime): { dist: number; relAngle: number } | null {
  const me = race.racers.find(r => r.isPlayer);
  if (!me?.body) return null;
  const t = me.body.translation(), q = me.body.rotation();
  const yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
  const fx = Math.cos(yaw), fz = -Math.sin(yaw);
  let best: { dist: number; relAngle: number } | null = null;
  for (const h of race.hazards) {
    if (h.kind !== 'juju' || h.target !== me.id || h.life <= 0) continue;
    const dx = h.x - t.x, dz = h.z - t.z, dist = Math.hypot(dx, dz);
    if (best && dist >= best.dist) continue;
    best = { dist, relAngle: Math.atan2(dx * fz - dz * fx, dx * fx + dz * fz) };
  }
  return best;
}

export function updateWarnings(race: RaceRuntime) {
  const me = race.racers.find(r => r.isPlayer);
  const incoming = race.phase === 'racing' && me && isIn(me) ? nearestJujuAtPlayer(race) : null;
  if (!incoming) { resetWarnings(); return; }
  if (!hum) { hum = new Loop('jujuFly'); hum.start(); }
  const w = jujuWarning(incoming.dist, incoming.relAngle);
  hum.set(w.gain, w.rate, w.pan);
}

export function resetWarnings() {
  hum?.stop();
  hum = null;
}
