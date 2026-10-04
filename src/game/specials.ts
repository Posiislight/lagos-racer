import type { RaceRuntime, Racer } from './runtime';
import { SPECIALS, driverById } from '../config/drivers';
import { lasting } from './items';
import { sfx } from './audio';
import { isIn } from './modes';

/**
 * Driver special powers. Each racer has a meter that fills while the race is on; at full, the special
 * button fires the driver's power: Push Squad (a steady boost) or Pepper Soup Trail (patches on the road
 * that make whoever drives through them cough and slow down).
 */

/** Multipliers on engine power (accel) and top speed from everything that speeds up or slows down a racer. */
export function speedFactors(r: Pick<Racer, 'boost' | 'curse' | 'push' | 'cough'>): { accel: number; top: number } {
  let accel = 1, top = 1;
  if (r.boost > 0) { accel *= 2.2; top *= 1.3; }
  if (r.curse > 0) { accel *= 0.55; top *= 0.62; }
  if (r.push > 0) { accel *= SPECIALS.push.accel; top *= SPECIALS.push.topSpeed; }
  if (r.cough > 0) { accel *= SPECIALS.soup.coughSpeed; top *= SPECIALS.soup.coughSpeed; }
  return { accel, top };
}

export function updateSpecials(race: RaceRuntime, dt: number, flash: (m: string) => void) {
  for (const r of race.racers) {
    // The race is on for everyone but during the countdown; a racer who has finished or is out stops charging.
    const on = race.phase !== 'countdown' && r.progress.finishTime === null && isIn(r);
    const special = driverById(r.driver).special;
    if (on) r.charge = Math.min(1, r.charge + dt / special.chargeTime);

    if (r.controls.special) {
      if (on && r.body && r.charge >= 1) {
        if (special.kind === 'push') {
          r.push = SPECIALS.push.duration;
          if (r.isPlayer) sfx('push');
        } else {
          r.trail = SPECIALS.soup.duration; r.trailDist = 0; r.trailCount = 0;
          if (r.isPlayer) sfx('soup');
        }
        r.charge = 0;
      } else if (on && r.isPlayer) sfx('notReady');
      r.controls.special = false;
    }

    r.push = Math.max(0, r.push - dt);
    r.cough = Math.max(0, r.cough - dt);
    r.trail = Math.max(0, r.trail - dt);
    if (r.progress.finishTime !== null) { r.push = 0; r.trail = 0; }
    if (r.trail > 0 && r.body && isIn(r)) dropSoup(race, r, dt);
  }

  // Anyone who drives through a patch coughs: slower and swerving, with a second's grace afterwards.
  const reach2 = SPECIALS.soup.radius ** 2;
  let spots: { x: number; z: number }[] | null = null;
  for (const h of race.hazards) {
    if (h.kind !== 'soup') continue;
    // Read each body's position once a frame (the physics call allocates), not once per patch.
    spots ??= race.racers.map(v => { const t = v.body?.translation(); return { x: t?.x ?? 0, z: t?.z ?? 0 }; });
    for (let i = 0; i < race.racers.length; i++) {
      const v = race.racers[i];
      if (!v.body || !isIn(v) || v.id === h.owner || v.shield > 0 || v.immune > 0) continue;
      const t = spots[i];
      if ((t.x - h.x) ** 2 + (t.z - h.z) ** 2 >= reach2) continue;
      v.cough = Math.max(v.cough, lasting(v, SPECIALS.soup.cough));
      v.immune = v.cough + SPECIALS.soup.immunity;
      if (v.isPlayer) { sfx('cough'); flash('COUGH!'); }
    }
  }
}

/** While the trail is on, drop a patch behind the vehicle every `spacing` metres it travels (up to `maxPatches`). */
function dropSoup(race: RaceRuntime, r: Racer, dt: number) {
  const { spacing, maxPatches, patchLife } = SPECIALS.soup;
  r.trailDist += Math.abs(r.speed) * dt;
  const t = r.body!.translation(), q = r.body!.rotation();
  const yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
  const fx = Math.cos(yaw), fz = -Math.sin(yaw);
  const back = r.vehicle.chassis.length * r.vehicle.scale / 2 + 1.2;
  const ground = race.track.points[r.progress.index].pos.y;
  while (r.trailDist >= spacing && r.trailCount < maxPatches) {
    r.trailDist -= spacing;
    const x = t.x - fx * back, z = t.z - fz * back;
    race.hazards.push({ id: race.nextId++, kind: 'soup', x, y: ground, z, vx: 0, vy: 0, vz: 0, owner: r.id, target: null, life: patchLife, armed: 0, ground });
    if (r.trailCount++ % 2 === 0) race.puffs.push({ x, y: ground, z, age: 0, color: 'steam' });
  }
  if (r.trailCount >= maxPatches) r.trailDist = 0;
}
