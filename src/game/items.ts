import type { Hazard, ItemKind, Pickup, RaceRuntime, Racer } from './runtime';
import { heightAt, sampleAt } from './track';
import { standings } from './race';
import { sfx } from './audio';

export const ITEM_LABEL: Record<ItemKind, string> = { fuel: 'Fuel', oil: 'Crude oil', juju: 'Juju', odeshi: 'Odeshi' };

const PICKUP_RADIUS = 1.6;
const OIL_RADIUS = 2.6;
const JUJU_SPEED = 46;
const JUJU_HIT = 2.2;
const ODESHI_TIME = 8;

/** How long an effect lasts: flimsy vehicles suffer longer, tough ones shrug it off. */
const lasting = (r: Racer, base: number) => base * (1.25 - r.vehicle.stats.toughness * 0.055);

/** Rows of glowing orbs across the road at the track's item distances. */
export function makePickups(race: Pick<RaceRuntime, 'config' | 'track'>, nextId: () => number): Pickup[] {
  const out: Pickup[] = [];
  const kinds: ItemKind[] = ['fuel', 'oil', 'juju', 'odeshi'];
  race.config.items.forEach((s, row) => {
    const at = sampleAt(race.track, s);
    // Every row mixes all four, shifted per row, so there's always a choice to steer for.
    [-0.6, -0.2, 0.2, 0.6].forEach((lane, i) => {
      const o = lane * race.config.halfWidth;
      out.push({ id: nextId(), kind: kinds[(i + row) % kinds.length], x: at.pos.x + at.right.x * o, y: at.pos.y, z: at.pos.z + at.right.z * o, s, respawn: 0 });
    });
  });
  return out;
}

/** The racer a juju should fly at: whoever is directly ahead, or second place if you lead. */
export function jujuTarget(race: RaceRuntime, from: Racer): Racer | null {
  const order = standings(race.racers).filter(r => r.progress.finishTime === null && !r.remote?.dnf);
  const i = order.indexOf(from);
  if (i > 0) return order[i - 1];
  return order[i + 1] ?? null;
}

export function updateItems(race: RaceRuntime, dt: number, flash: (m: string) => void) {
  // Orbs: drive through one to get a random item if your hands are free. Other phones pick up for their own cars.
  for (const p of race.pickups) {
    if (p.respawn > 0) { p.respawn -= dt; continue; }
    for (const r of race.racers) {
      if (!r.body || r.item || r.kind === 'remote') continue;
      const t = r.body.translation();
      const reach = PICKUP_RADIUS + r.vehicle.chassis.width * r.vehicle.scale * 0.5;
      if ((t.x - p.x) ** 2 + (t.z - p.z) ** 2 < reach * reach) {
        r.item = p.kind;
        p.respawn = 3;
        if (r.ai) r.ai.itemDelay = 0.6 + Math.random() * 2;
        if (r.isPlayer) sfx('pickup');
        race.net?.pickup(p.id);
        break;
      }
    }
  }

  // Use items.
  for (const r of race.racers) {
    if (!r.controls.useItem || !r.item || !r.body || r.kind === 'remote' || race.phase === 'countdown') continue;
    const t = r.body.translation(), q = r.body.rotation(), lv = r.body.linvel();
    const yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
    const fx = Math.cos(yaw), fz = -Math.sin(yaw);
    const len = r.vehicle.chassis.length * r.vehicle.scale / 2;
    const ground = race.track.points[r.progress.index].pos.y;
    const id = race.nextId++;
    if (r.item === 'fuel') {
      r.boost = 2.6;
      if (r.isPlayer) sfx('boost');
    } else if (r.item === 'oil') {
      const h: Hazard = { id, kind: 'oil', x: t.x - fx * (len + 2.2), y: ground, z: t.z - fz * (len + 2.2), vx: 0, vy: 0, vz: 0,
        owner: r.id, target: null, life: 22, armed: 1, ground };
      race.hazards.push(h);
      race.net?.use(h);
      if (r.isPlayer) sfx('oil');
    } else if (r.item === 'odeshi') {
      r.shield = ODESHI_TIME;
      if (r.isPlayer) sfx('odeshi');
    } else {
      // The conductor (or rider) sends the juju flying at the racer ahead.
      const target = jujuTarget(race, r);
      const h: Hazard = { id, kind: 'juju', x: t.x + fx * (len + 1), y: ground + 2.2, z: t.z + fz * (len + 1),
        vx: lv.x + fx * JUJU_SPEED, vy: 0, vz: lv.z + fz * JUJU_SPEED, owner: r.id, target: target?.id ?? null, life: 7, armed: 0.6, ground };
      race.hazards.push(h);
      race.net?.use(h);
      if (r.isPlayer) sfx('throw');
    }
    r.item = null;
    r.controls.useItem = false;
  }

  for (const r of race.racers) {
    r.immune = Math.max(0, r.immune - dt);
    r.boost = Math.max(0, r.boost - dt);
    r.slip = Math.max(0, r.slip - dt);
    r.curse = Math.max(0, r.curse - dt);
    r.shield = Math.max(0, r.shield - dt);
    r.wobble = Math.max(0, r.wobble - dt);
  }

  for (const h of race.hazards) {
    h.life -= dt; h.armed -= dt;
    if (h.kind === 'juju') updateJuju(race, h, dt, flash);
    else {
      // Each phone decides only for the cars it drives; a remote car's slip arrives in its snapshots.
      for (const r of race.racers) {
        if (!r.body || r.kind === 'remote' || r.immune > 0 || r.shield > 0 || (h.armed > 0 && r.id === h.owner)) continue;
        const t = r.body.translation();
        if ((t.x - h.x) ** 2 + (t.z - h.z) ** 2 < OIL_RADIUS * OIL_RADIUS) {
          r.slip = Math.max(r.slip, lasting(r, 2.6));
          r.immune = r.slip + 1;
          if (r.isPlayer) { sfx('slip'); flash('OIL!'); }
          h.life = Math.min(h.life, 8); // the slick gets smeared away
          race.net?.hit(h.id, r.id);
        }
      }
    }
  }
  race.hazards = race.hazards.filter(h => h.life > 0);
  race.puffs.forEach(p => (p.age += dt));
  race.puffs = race.puffs.filter(p => p.age < 1.2);
}

/** A juju homes in on its target, skimming over the road, and slows them down when it lands. */
function updateJuju(race: RaceRuntime, h: Hazard, dt: number, flash: (m: string) => void) {
  const target = race.racers.find(r => r.id === h.target && r.body && !r.remote?.dnf);
  h.ground = heightAt(race.track, h.x, h.z);
  if (target?.body) {
    const t = target.body.translation();
    const dx = t.x - h.x, dz = t.z - h.z, d = Math.hypot(dx, dz) || 1;
    // Turn the velocity towards the target (strongly, it's juju) and keep the speed up.
    const turn = Math.min(1, dt * 4.5);
    h.vx += (dx / d * JUJU_SPEED - h.vx) * turn;
    h.vz += (dz / d * JUJU_SPEED - h.vz) * turn;
  }
  h.x += h.vx * dt; h.z += h.vz * dt;
  h.y += ((h.ground + 1.6 + Math.sin(h.life * 9) * 0.25) - h.y) * Math.min(1, dt * 6);

  // A juju at a remote car keeps flying until that car's phone says it landed.
  for (const r of race.racers) {
    if (!r.body || r.kind === 'remote' || r.id === h.owner) continue;
    const t = r.body.translation(), reach = JUJU_HIT + r.vehicle.chassis.width * r.vehicle.scale * 0.5;
    if ((t.x - h.x) ** 2 + (t.z - h.z) ** 2 > reach * reach) continue;
    if (r.shield > 0) {
      // Odeshi: the juju fizzles out against the charm.
      race.puffs.push({ x: h.x, y: h.ground, z: h.z, age: 0, color: 'odeshi' });
      if (r.isPlayer) { sfx('odeshi'); flash('ODESHI!'); }
      else if (race.racers.find(o => o.id === h.owner)?.isPlayer) sfx('odeshi');
      h.life = 0;
      return;
    }
    // Cursed: lose most of your speed now, and struggle to pick it up again for a while.
    const lv = r.body.linvel(), keep = 0.45 + r.vehicle.stats.toughness * 0.03;
    r.body.setLinvel({ x: lv.x * keep, y: lv.y, z: lv.z * keep }, true);
    r.curse = Math.max(r.curse, lasting(r, 2.6));
    r.boost = 0;
    race.puffs.push({ x: h.x, y: h.ground, z: h.z, age: 0, color: 'juju' });
    if (r.isPlayer) { sfx('juju'); flash('JUJU!'); }
    else if (race.racers.find(o => o.id === h.owner)?.isPlayer) sfx('juju');
    h.life = 0;
    race.net?.hit(h.id, r.id);
    return;
  }
}
