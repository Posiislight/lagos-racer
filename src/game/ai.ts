import { MathUtils } from 'three';
import type { RaceRuntime, Racer } from './runtime';
import { sampleAt } from './track';

export const AI_NAMES = ['Odogwu Rider', 'Starboy-ish', 'Mama Danfo', 'Conductor Sule', 'Aunty Bisi', 'Area Fada', 'Oga Landlord'];

/** Speed (m/s) a vehicle can hold through a bend of curvature k with the given grip (m/s²). */
export function cornerSpeed(k: number, grip: number) {
  return Math.sqrt(grip / Math.max(Math.abs(k), 1e-4));
}

export function driveAI(r: Racer, race: RaceRuntime, dt: number, leaderGap: number) {
  const ai = r.ai, b = r.body;
  if (!ai || !b) return;
  const c = r.controls, track = race.track, t = r.vehicle.tuning, hw = race.config.halfWidth;
  const pos = b.translation(), q = b.rotation();
  // Forward (+x) and right (+z) of the car from its rotation (yaw only; roll and pitch are locked).
  const yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
  const fx = Math.cos(yaw), fz = -Math.sin(yaw), rx = -fz, rz = fx;
  const v = r.speed;

  // Wander between lanes now and then, and dodge whoever is just ahead in our lane.
  if (Math.random() < dt * 0.25) ai.laneTarget = (Math.random() * 2 - 1) * hw * 0.45;
  for (const o of race.racers) {
    if (o === r || !o.body) continue;
    const ahead = o.progress.distance - r.progress.distance;
    if (ahead > 0 && ahead < 12 && Math.abs(o.progress.lateral - ai.lane) < 2.6) {
      ai.laneTarget = MathUtils.clamp(o.progress.lateral + (o.progress.lateral > 0 ? -3.5 : 3.5), -hw * 0.55, hw * 0.55);
    }
  }
  // Steer at oil slicks less: move away from any slick in the next 30 m.
  for (const h of race.hazards) {
    if (h.kind !== 'oil') continue;
    const dx = h.x - pos.x, dz = h.z - pos.z, along = dx * fx + dz * fz, side = dx * rx + dz * rz;
    if (along > 0 && along < 30 && Math.abs(side) < 4) ai.laneTarget = MathUtils.clamp(r.progress.lateral - Math.sign(side || 1) * 4, -hw * 0.55, hw * 0.55);
  }
  // ...and swerve round goats standing in the road (chickens are fair game).
  for (const cr of race.critters) {
    if (cr.kind !== 'goat' || (cr.state !== 'walk' && cr.state !== 'wait')) continue;
    const dx = cr.x - pos.x, dz = cr.z - pos.z, along = dx * fx + dz * fz, side = dx * rx + dz * rz;
    if (along > 4 && along < 28 && Math.abs(side) < 3 && Math.random() < 0.85) ai.laneTarget = MathUtils.clamp(r.progress.lateral - Math.sign(side || 1) * 4.5, -hw * 0.75, hw * 0.75);
  }
  ai.lane += (ai.laneTarget - ai.lane) * Math.min(1, dt * 0.8);

  // Aim at a point ahead on our lane; look further ahead the faster we go.
  const look = 7 + Math.abs(v) * 0.55;
  const aim = sampleAt(track, r.progress.s + look);
  const ax = aim.pos.x + aim.right.x * ai.lane, az = aim.pos.z + aim.right.z * ai.lane;
  const dx = ax - pos.x, dz = az - pos.z, len = Math.hypot(dx, dz) || 1;
  const sideAim = (dx * rx + dz * rz) / len, fwdAim = (dx * fx + dz * fz) / len;
  let steer = MathUtils.clamp(Math.atan2(sideAim, fwdAim) * 2.2, -1, 1);

  // Brake for the tightest bend within stopping distance.
  const grip = 8.5 * ai.skill * (0.8 + r.vehicle.stats.handling * 0.03);
  let target = t.topSpeed * ai.skill;
  const horizon = 12 + (v * v) / (2 * 9);
  for (let d = 4; d < horizon; d += 4) {
    const k = track.points[sampleAt(track, r.progress.s + d).index].curvature;
    target = Math.min(target, cornerSpeed(k, grip) + d * 0.35);
  }

  // Rubber band: ease off when far ahead of the player, push harder when far behind.
  r.topBoost = MathUtils.clamp(1 - leaderGap * 0.0012, 0.9, 1.12);
  target *= r.topBoost;

  let throttle = v < target - 0.5 ? 1 : v < target + 1 ? 0.4 : 0;
  let brake = v > target + 2.5 ? 1 : 0;

  // Unstick: if pinned against something, reverse out with opposite lock. Trouble builds up while
  // slow or reversing and only drains once properly moving again, so a car that keeps getting
  // stuck in the same spot is put back on the track after a few seconds.
  if (race.phase === 'racing') {
    ai.stuck = Math.abs(v) < 1.5 ? ai.stuck + dt : 0;
    if (ai.stuck > 1.0 && ai.reverseTime <= 0) { ai.reverseTime = 1.0; ai.stuck = 0; }
    if (ai.reverseTime > 0) { ai.reverseTime -= dt; throttle = 0; brake = 1; steer = -steer; }
    if (Math.abs(v) < 4 || ai.reverseTime > 0) r.trouble += dt;
    else if (Math.abs(v) > 8) r.trouble = Math.max(0, r.trouble - dt * 2);
    const long = r.vehicle.chassis.length * r.vehicle.scale > 6;
    if (r.trouble > (long ? 2.4 : 3.5)) { r.respawn = true; r.trouble = 0; ai.reverseTime = 0; ai.stuck = 0; }
  }

  c.steer = steer;
  c.throttle = throttle;
  c.brake = brake;
  c.handbrake = false;
  c.horn = Math.random() < dt * 0.04;

  // Items: fuel on a straight, juju when there's someone ahead to send it at, oil when someone
  // is right behind; otherwise use it before long anyway.
  c.useItem = false;
  if (r.item) {
    ai.itemDelay -= dt;
    let use = ai.itemDelay < -6;
    if (r.item === 'fuel') {
      const k = Math.abs(track.points[sampleAt(track, r.progress.s + 25).index].curvature);
      use ||= ai.itemDelay < 0 && k < 0.02;
    }
    for (const o of race.racers) {
      if (o === r) continue;
      const gap = o.progress.distance - r.progress.distance;
      if (r.item === 'juju' && gap > 5 && gap < 120) use ||= ai.itemDelay < 0;
      if (r.item === 'oil' && gap < -3 && gap > -25) use ||= ai.itemDelay < 0;
    }
    if (use) { c.useItem = true; ai.itemDelay = 1 + Math.random() * 3; }
  }
}
