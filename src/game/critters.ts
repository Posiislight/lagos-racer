import type { RaceRuntime } from './runtime';
import { sampleAt } from './track';
import { sfx } from './audio';

/**
 * Goats and chickens wandering across the road: Lagos's answer to Beach Buggy's beach critters.
 * Each lives at a crossing point, ambles from one roadside to the other, waits, and comes back.
 * Hit one and it goes flying, vanishes, and turns up again a while later. It never stops you: a
 * little speed and a few seconds of shaky handling (less if your vehicle is tough).
 */
export type CritterKind = 'goat' | 'chicken';

export type Critter = {
  id: number;
  kind: CritterKind;
  /** Crossing point along the track and this animal's offset along the road from it. */
  s: number;
  along: number;
  /** Lateral position (m, + right) and where it's heading. */
  lat: number;
  target: number;
  speed: number;
  /** 'wait' on the roadside, 'walk' across, 'fly' after being hit, 'gone' until respawn. */
  state: 'wait' | 'walk' | 'fly' | 'gone';
  timer: number;
  // World position, velocity (for flying) and facing.
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  yaw: number;
  spin: number;
  /** Walk cycle phase for the legs. */
  phase: number;
};

const RADIUS: Record<CritterKind, number> = { goat: 0.75, chicken: 0.35 };
const WALK: Record<CritterKind, number> = { goat: 1.3, chicken: 2.8 };

export function makeCritters(race: Pick<RaceRuntime, 'config' | 'track'>, rand = Math.random): Critter[] {
  const out: Critter[] = [];
  let id = 1;
  const hw = race.config.halfWidth;
  for (const c of race.config.critters ?? []) {
    for (let i = 0; i < c.count; i++) {
      const side = rand() < 0.5 ? -1 : 1;
      const lat = side * (hw + 1.2 + rand() * 1.4);
      out.push({
        id: id++, kind: c.kind, s: c.s, along: (i - (c.count - 1) / 2) * (c.kind === 'goat' ? 2.4 : 1.2) + (rand() - 0.5),
        lat, target: -lat, speed: WALK[c.kind] * (0.8 + rand() * 0.4), state: 'wait', timer: 1 + rand() * 6,
        x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, spin: 0, phase: rand() * 6,
      });
    }
  }
  out.forEach(c => place(race, c));
  return out;
}

function place(race: Pick<RaceRuntime, 'track' | 'config'>, c: Critter) {
  const at = sampleAt(race.track, c.s + c.along);
  // Chickens zigzag as they go.
  const wobble = c.kind === 'chicken' && c.state === 'walk' ? Math.sin(c.phase * 0.7) * 0.9 : 0;
  c.x = at.pos.x + at.right.x * c.lat + at.tangent.x * wobble;
  c.z = at.pos.z + at.right.z * c.lat + at.tangent.z * wobble;
  c.y = at.pos.y + (Math.abs(c.lat) > race.config.halfWidth + 0.3 ? 0.18 : 0);
  if (c.state === 'walk') {
    const dir = Math.sign(c.target - c.lat);
    // Face across the road (local +x is the animal's nose).
    const fx = at.right.x * dir + at.tangent.x * wobble * 0.3, fz = at.right.z * dir + at.tangent.z * wobble * 0.3;
    c.yaw = Math.atan2(-fz, fx);
  }
}

export function updateCritters(race: RaceRuntime, dt: number) {
  const hw = race.config.halfWidth;
  for (const c of race.critters) {
    switch (c.state) {
      case 'wait':
        c.timer -= dt;
        if (c.timer <= 0) { c.state = 'walk'; c.target = -Math.sign(c.lat) * (hw + 1.2 + Math.random() * 1.4); }
        place(race, c);
        break;
      case 'walk': {
        // Goats sometimes just stop in the middle of the road and stare at you.
        if (c.kind === 'goat' && Math.abs(c.lat) < hw * 0.6 && Math.random() < dt * 0.25) c.timer = 1 + Math.random() * 2.5;
        if (c.timer > 0) { c.timer -= dt; place(race, c); break; }
        const step = Math.sign(c.target - c.lat) * c.speed * dt;
        c.lat += step;
        c.phase += dt * c.speed * (c.kind === 'goat' ? 5 : 9);
        if (Math.abs(c.target - c.lat) < Math.abs(step) + 0.05) { c.lat = c.target; c.state = 'wait'; c.timer = 2 + Math.random() * 7; }
        place(race, c);
        break;
      }
      case 'fly':
        c.vy -= 22 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt; c.yaw += c.spin * dt;
        c.timer -= dt;
        if (c.timer <= 0 || c.y < race.track.points[0].pos.y - 20) { c.state = 'gone'; c.timer = 7 + Math.random() * 6; }
        break;
      case 'gone':
        c.timer -= dt;
        if (c.timer <= 0) {
          c.state = 'wait'; c.timer = 2 + Math.random() * 4;
          c.lat = (Math.random() < 0.5 ? -1 : 1) * (hw + 1.2 + Math.random() * 1.4);
          place(race, c);
        }
        break;
    }
    if (c.state === 'wait' || c.state === 'walk') checkHits(race, c);
  }
}

function checkHits(race: RaceRuntime, c: Critter) {
  for (const r of race.racers) {
    if (!r.body) continue;
    const t = r.body.translation(), q = r.body.rotation();
    const yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
    const fx = Math.cos(yaw), fz = -Math.sin(yaw);
    const dx = c.x - t.x, dz = c.z - t.z;
    const along = dx * fx + dz * fz, side = Math.abs(dx * -fz + dz * fx);
    const halfL = r.vehicle.chassis.length * r.vehicle.scale / 2, halfW = r.vehicle.chassis.width * r.vehicle.scale / 2;
    if (Math.abs(along) > halfL + RADIUS[c.kind] || side > halfW + RADIUS[c.kind]) continue;

    // Send it flying the way the vehicle was going, with a bit of sideways scatter.
    const lv = r.body.linvel(), speed = Math.hypot(lv.x, lv.z);
    c.state = 'fly'; c.timer = 1.3;
    c.vx = lv.x * 0.7 + (Math.random() - 0.5) * 6; c.vz = lv.z * 0.7 + (Math.random() - 0.5) * 6;
    c.vy = 7 + speed * 0.25; c.spin = (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 8);
    // It never stops you: a little speed lost and a shaky ride for a moment. Flimsy rides feel
    // it more, buses hardly at all.
    const flimsy = 1.15 - r.vehicle.stats.toughness * 0.09;
    const keep = 1 - Math.max(0, (c.kind === 'goat' ? 0.16 : 0.06) * flimsy);
    r.body.setLinvel({ x: lv.x * keep, y: lv.y, z: lv.z * keep }, true);
    r.wobble = Math.max(r.wobble, (c.kind === 'goat' ? 1.3 : 0.8) * Math.max(0.3, flimsy));
    // Hit sound: replace with your own recording in audio.ts (sfx 'goat' / 'chicken').
    if (r.isPlayer) sfx(c.kind === 'goat' ? 'goat' : 'chicken');
    return;
  }
}
