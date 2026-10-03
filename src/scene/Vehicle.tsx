import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, RoundCuboidCollider, useBeforePhysicsStep, useRapier, type RapierRigidBody } from '@react-three/rapier';
import type { DynamicRayCastVehicleController } from '@dimforge/rapier3d-compat';
import {
  AdditiveBlending, ConeGeometry, Group, MathUtils, Mesh, MeshBasicMaterial, Quaternion, SphereGeometry, Vector3,
} from 'three';
import { buildVehicleModel } from '../models';
import { getRace, type Racer } from '../game/runtime';
import { bumpShove } from '../game/bump';
import { sampleAt } from '../game/track';
import { resyncProgress } from '../game/race';
import { playHorn } from '../game/audio';

const G = 9.81;
const _q = new Quaternion(), _fwd = new Vector3(), _v = new Vector3();

/** Physical layout derived from the vehicle config, in metres after scaling. */
function layout(racer: Racer) {
  const { chassis, wheels, scale: s, tuning } = racer.vehicle;
  const R = wheels.radius * s, L = tuning.suspension.rest;
  const sag = G / (4 * tuning.suspension.stiffness);
  const originY = chassis.centreY * s;
  const connectY = R + (L - sag) - originY;
  return {
    half: [chassis.length * s / 2, chassis.height * s / 2, chassis.width * s / 2] as [number, number, number],
    originY, connectY, R, L,
    /** Collider edge rounding: half the narrower of length and width. */
    round: Math.min(chassis.length, chassis.width) * s / 4,
    wheels: [
      [wheels.frontX * s, -wheels.frontZ * s], [wheels.frontX * s, wheels.frontZ * s],
      [wheels.rearX * s, -wheels.rearZ * s], [wheels.rearX * s, wheels.rearZ * s],
    ] as [number, number][],
  };
}

export function Vehicle({ racer, spawn, merge = true }: { racer: Racer; spawn: { x: number; y: number; z: number; yaw: number }; merge?: boolean }) {
  const body = useRef<RapierRigidBody>(null);
  const visual = useRef<Group>(null);
  const tilt = useRef<Group>(null);
  const controller = useRef<DynamicRayCastVehicleController | null>(null);
  const { world } = useRapier();
  const lay = useMemo(() => layout(racer), [racer]);
  const model = useMemo(() => buildVehicleModel(racer.vehicle.id, racer.vehicle.scale, { merge, shadowProxy: true }), [racer.vehicle, merge]);
  const state = useRef({ roll: 0, pitch: 0, yawRate: 0, lastSpeed: 0, hornCooldown: 0, bumpCooldown: 0 });
  /** Shove this racer away from another one it's touching. */
  const shove = (other: Racer) => {
    const b = body.current, ob = other.body;
    if (!b || !ob) return;
    const t = b.translation(), lv = b.linvel(), ot = ob.translation(), ov = ob.linvel();
    const s = bumpShove({ x: t.x, z: t.z, vx: lv.x, vz: lv.z, mass: racer.vehicle.tuning.mass }, { x: ot.x, z: ot.z, vx: ov.x, vz: ov.z, mass: other.vehicle.tuning.mass });
    racer.bump.x += s.x; racer.bump.z += s.z;
    state.current.bumpCooldown = 0.25;
  };
  const fx = useMemo(() => effectMeshes(lay), [lay]);

  useEffect(() => {
    const b = body.current;
    if (!b) return;
    racer.body = b;
    racer.visual = visual.current;
    const t = racer.vehicle.tuning;
    const vc = world.createVehicleController(b);
    lay.wheels.forEach(([x, z]) => {
      // Rapier takes forward = axle × suspension direction, so axle +z gives forward +x.
      vc.addWheel({ x, y: lay.connectY, z }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, lay.L, lay.R);
    });
    for (let i = 0; i < 4; i++) {
      vc.setWheelSuspensionStiffness(i, t.suspension.stiffness);
      vc.setWheelSuspensionCompression(i, t.suspension.compression);
      vc.setWheelSuspensionRelaxation(i, t.suspension.relaxation);
      vc.setWheelMaxSuspensionTravel(i, lay.L * 0.9);
      vc.setWheelMaxSuspensionForce(i, t.mass * G * 3);
      vc.setWheelFrictionSlip(i, t.grip);
      vc.setWheelSideFrictionStiffness(i, 1);
    }
    controller.current = vc;
    return () => {
      controller.current = null;
      try { world.removeVehicleController(vc); } catch { /* world already torn down */ }
      racer.body = null;
      racer.visual = null;
    };
  }, [world, racer, lay]);

  useBeforePhysicsStep(w => {
    const vc = controller.current, b = body.current, race = getRace();
    if (!vc || !b || !race) return;
    const dt = w.timestep, t = racer.vehicle.tuning, c = racer.controls;

    if (racer.respawn || b.translation().y < race.track.points[racer.progress.index].pos.y - 5) { respawn(racer, b); racer.respawn = false; return; }

    // Still pressed against another vehicle: keep pushing apart a few times a second.
    const st = state.current;
    st.bumpCooldown -= dt;
    if (racer.touching.size && st.bumpCooldown <= 0) for (const id of racer.touching) { const o = race.racers.find(r => r.id === id); if (o) shove(o); }

    const v = vc.currentVehicleSpeed();
    racer.speed = v;
    const speedFrac = Math.min(1, Math.abs(v) / t.topSpeed);
    const racing = race.phase !== 'countdown';
    const boosting = racer.boost > 0, cursed = racer.curse > 0, slippy = racer.slip > 0;

    // Steering: full lock when slow, less at speed. Positive wheel angle turns left.
    // Running over animals makes the steering shaky; oil makes the vehicle wander.
    let steerIn = c.steer;
    if (racer.wobble > 0) steerIn += Math.sin(race.clock * 23 + racer.id * 5) * 0.4 * Math.min(1, racer.wobble * 1.5);
    if (slippy) steerIn += Math.sin(race.clock * 6 + racer.id * 3) * 0.35;
    const steerScale = MathUtils.lerp(1, t.steerAtSpeed, speedFrac);
    const steer = -MathUtils.clamp(steerIn, -1, 1) * t.steer * steerScale;
    vc.setWheelSteering(0, steer); vc.setWheelSteering(1, steer);

    // Engine: strong low down, fading to nothing at top speed. Brake button reverses when stopped.
    // Fuel gives a burst of extra speed; juju holds you back for a while.
    const perWheel = t.mass * t.accel / 4 * (boosting ? 2.2 : 1) * (cursed ? 0.55 : 1);
    let engine = 0, brake = 0;
    if (racing) {
      const top = t.topSpeed * racer.topBoost * (boosting ? 1.3 : 1) * (cursed ? 0.62 : 1);
      if (c.throttle > 0 && v < top) engine = perWheel * c.throttle * Math.max(0.15, 1 - (Math.max(0, v) / top) ** 2);
      if (v > top + 1) brake = t.mass / 1200; // shed speed gently when juju lowers the limit
      if (c.brake > 0) {
        if (v > 1) brake = t.brake * t.mass / 600;
        else if (v > -9) engine = -perWheel * 0.6;
      }
    } else if (!racing) {
      brake = t.brake * t.mass / 300; // held on the line during the countdown
    }
    if (c.throttle === 0 && c.brake === 0 && racing) brake = t.mass / 2500; // engine braking
    for (let i = 0; i < 4; i++) { vc.setWheelEngineForce(i, engine); vc.setWheelBrake(i, brake); }

    // Handbrake drift: rear tyres let go, fronts keep biting. Oil takes the grip from all four.
    const grip = slippy ? t.grip * 0.3 : t.grip;
    const rearGrip = c.handbrake && v > 6 ? grip * t.driftGrip : grip;
    vc.setWheelFrictionSlip(0, grip); vc.setWheelFrictionSlip(1, grip);
    vc.setWheelFrictionSlip(2, rearGrip); vc.setWheelFrictionSlip(3, rearGrip);
    if (c.handbrake && racing) { vc.setWheelBrake(2, brake + t.mass / 1500); vc.setWheelBrake(3, brake + t.mass / 1500); }

    vc.updateVehicle(dt);

    const grounded = [0, 1, 2, 3].some(i => vc.wheelIsInContact(i));
    const lin = b.linvel(), ang = b.angvel();
    _q.copy(b.rotation() as Quaternion);
    _fwd.set(1, 0, 0).applyQuaternion(_q);

    if (grounded) {
      // Yaw assist: nudge the turn rate towards what the steering asks for, so long buses and
      // twitchy bikes both feel responsive. The bicycle-model rate is v·tan(δ)/wheelbase.
      const wheelbase = (racer.vehicle.wheels.frontX - racer.vehicle.wheels.rearX) * racer.vehicle.scale;
      const want = (v * Math.tan(steer)) / wheelbase * (c.handbrake ? 1.35 : 1);
      const k = Math.min(1, t.yawAssist * dt * 4 * (slippy ? 0.35 : 1));
      b.setAngvel({ x: ang.x, y: ang.y + (want - ang.y) * k, z: ang.z }, true);

      // Kill most sideways slide (arcade grip) unless drifting. A bump's shove is taken out first and
      // put back afterwards, so the grip can't cancel it and bumped vehicles really move apart.
      _v.set(lin.x - racer.bump.x, 0, lin.z - racer.bump.z);
      const fwdSpeed = _v.dot(_fwd);
      const side = _v.clone().addScaledVector(_fwd, -fwdSpeed);
      const keep = slippy ? 0.985 : c.handbrake ? 0.97 : 0.86;
      const sideScale = Math.pow(keep, dt * 60);
      let nx = _fwd.x * fwdSpeed + side.x * sideScale, nz = _fwd.z * fwdSpeed + side.z * sideScale;

      // Hitting things costs speed: a knock on impact (walls, other vehicles) and a steady drag
      // while scraping along a wall. You keep accelerating, so it's a penalty, not a stop.
      if (racer.knock > 0) { nx *= 1 - racer.knock; nz *= 1 - racer.knock; racer.knock = 0; }
      // Scraping: the vehicle's outermost corner is at the kerb wall (worked out from where it
      // sits across the road and the angle it's at, which is steadier than contact events).
      const at = race.track.points[racer.progress.index];
      const along = Math.abs(_fwd.x * at.tangent.x + _fwd.z * at.tangent.z), across = Math.sqrt(Math.max(0, 1 - along * along));
      const reach = Math.abs(racer.progress.lateral) + lay.half[2] * along + lay.half[0] * across;
      racer.scraping = reach > race.config.halfWidth + 0.28;
      if (racer.scraping) { const drag = Math.pow(0.55, dt); nx *= drag; nz *= drag; }
      b.setLinvel({ x: nx + racer.bump.x, y: lin.y, z: nz + racer.bump.z }, true);
      // Fuel: a push from behind on top of the extra engine power.
      if (boosting && v < t.topSpeed * 1.3) b.applyImpulse({ x: _fwd.x * t.mass * 9 * dt, y: 0, z: _fwd.z * t.mass * 9 * dt }, true);

      // A little downforce keeps the wheels planted over kerbs.
      b.applyImpulse({ x: 0, y: -t.mass * 0.03 * Math.abs(v) * dt, z: 0 }, true);
    }
    // The shove fades out over about 0.4 s.
    const fade = Math.exp(-dt / 0.13);
    racer.bump.x *= fade; racer.bump.z *= fade;
    if (Math.hypot(racer.bump.x, racer.bump.z) < 0.05) racer.bump.x = racer.bump.z = 0;
  });

  useFrame((st, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05), s = state.current, t = racer.vehicle.tuning;
    const b = body.current;
    if (!b) return;
    const v = racer.speed;
    // Wheels roll with road speed.
    for (const w of model.wheels) w.obj.rotation.z -= (v / (w.radius * racer.vehicle.scale)) * dt;
    // Body lean from lateral load (bikes into the bend, cars outwards) and pitch from accel.
    const yaw = b.angvel().y;
    s.yawRate += (yaw - s.yawRate) * Math.min(1, dt * 8);
    const lat = MathUtils.clamp((-s.yawRate * v) / G, -1.2, 1.2);
    const accel = (v - s.lastSpeed) / Math.max(dt, 1e-3);
    s.lastSpeed = v;
    s.roll += (lat * t.lean - s.roll) * Math.min(1, dt * 6);
    // Roll and pitch are locked in the physics, so tilt the body to follow the hills visually.
    let slope = 0;
    const race = getRace();
    if (race) {
      const pts = race.track.points, i = racer.progress.index, a = pts[i], nb = pts[(i + 1) % pts.length];
      _fwd.set(1, 0, 0).applyQuaternion(b.rotation() as Quaternion);
      slope = Math.atan((nb.pos.y - a.pos.y) / race.track.spacing) * (_fwd.x * a.tangent.x + _fwd.z * a.tangent.z);
    }
    s.pitch += (slope + MathUtils.clamp(-accel * 0.004, -0.05, 0.05) - s.pitch) * Math.min(1, dt * 5);
    // Shaky ride after hitting an animal; a looser sway on oil.
    const tt = st.clock.elapsedTime;
    const shake = racer.wobble > 0 ? Math.sin(tt * 38) * 0.05 * Math.min(1, racer.wobble * 1.5) : 0;
    const sway = racer.slip > 0 ? Math.sin(tt * 5) * 0.05 : 0;
    if (tilt.current) {
      tilt.current.rotation.x = s.roll + shake + sway;
      tilt.current.rotation.z = s.pitch + shake * 0.5;
      tilt.current.position.y = lay.originY * 0.4 + (racer.wobble > 0 ? Math.abs(Math.sin(tt * 31)) * 0.06 : 0);
    }
    // Fuel flame out the back and the purple juju aura.
    fx.flame.visible = racer.boost > 0;
    if (fx.flame.visible) fx.flame.scale.set(1, 0.8 + Math.random() * 0.5, 1);
    fx.aura.visible = racer.curse > 0;
    if (fx.aura.visible) {
      const p = 1 + Math.sin(tt * 9) * 0.08;
      fx.aura.scale.set(p, p, p);
      (fx.aura.material as MeshBasicMaterial).opacity = 0.25 + 0.15 * Math.min(1, racer.curse);
    }
    model.anim?.(st.clock.elapsedTime);
    // Horn
    s.hornCooldown -= dt;
    if (racer.controls.horn && s.hornCooldown <= 0) { playHorn(racer.vehicle.horn, racer.isPlayer); s.hornCooldown = 0.9; }
  });

  return (
    <RigidBody
      ref={body}
      colliders={false}
      position={[spawn.x, spawn.y + lay.originY + 0.15, spawn.z]}
      rotation={[0, spawn.yaw, 0]}
      enabledRotations={[false, true, false]}
      linearDamping={0.05}
      angularDamping={1.5}
      ccd
      canSleep={false}
      userData={{ racer: racer.id }}
      onCollisionEnter={({ other, manifold }) => {
        const ud = other.rigidBody?.userData as { wall?: boolean; racer?: number } | undefined;
        const lv = body.current?.linvel();
        if (!ud || !lv) return;
        const speed = Math.hypot(lv.x, lv.z) || 1, n = manifold.normal();
        const headOn = Math.abs(lv.x * n.x + lv.z * n.z) / speed;
        if (ud.wall) {
          racer.knock = Math.max(racer.knock, 0.06 + 0.4 * headOn);
        } else if (ud.racer !== undefined) {
          // The lighter vehicle comes off worse: a little speed lost, and a shove away from the other.
          const o = getRace()?.racers.find(r => r.id === ud.racer);
          const share = o ? o.vehicle.tuning.mass / (o.vehicle.tuning.mass + racer.vehicle.tuning.mass) : 0.5;
          racer.knock = Math.max(racer.knock, (0.03 + 0.12 * headOn) * share * 2);
          if (o) { racer.touching.add(o.id); shove(o); }
        }
      }}
      onCollisionExit={({ other }) => {
        const ud = other.rigidBody?.userData as { racer?: number } | undefined;
        if (ud?.racer !== undefined) racer.touching.delete(ud.racer);
      }}
    >
      {/* Rounded edges let vehicles slide off each other instead of locking corners. */}
      <RoundCuboidCollider args={[lay.half[0] - lay.round, lay.half[1] - lay.round, lay.half[2] - lay.round, lay.round]} mass={racer.vehicle.tuning.mass} friction={0.2} restitution={0.25} />
      <group ref={visual}>
        <group position={[0, -lay.originY, 0]}>
          <group ref={tilt} position={[0, lay.originY * 0.4, 0]}>
            <primitive object={model.root} position={[0, -lay.originY * 0.4, 0]} />
          </group>
          <primitive object={fx.flame} />
          <primitive object={fx.aura} />
        </group>
      </group>
    </RigidBody>
  );
}

/** Put a car back on the centre line where it left the track, facing the right way. */
export function respawn(racer: Racer, b: RapierRigidBody) {
  const race = getRace();
  if (!race) return;
  const at = sampleAt(race.track, racer.progress.s);
  const lane = MathUtils.clamp(racer.progress.lateral, -race.config.halfWidth * 0.5, race.config.halfWidth * 0.5);
  const x = at.pos.x + at.right.x * lane, z = at.pos.z + at.right.z * lane;
  const yaw = Math.atan2(-at.tangent.z, at.tangent.x);
  b.setTranslation({ x, y: at.pos.y + racer.vehicle.chassis.centreY * racer.vehicle.scale + 0.4, z }, true);
  b.setRotation(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw), true);
  b.setLinvel({ x: 0, y: 0, z: 0 }, true);
  b.setAngvel({ x: 0, y: 0, z: 0 }, true);
  racer.scraping = false;
  racer.bump.x = racer.bump.z = 0;
  resyncProgress(race.track, racer.progress, x, z);
}

/** Fuel flame out of the back and a purple juju aura, both hidden until needed. */
function effectMeshes(lay: ReturnType<typeof layout>) {
  const [len, h, w] = lay.half;
  const flame = new Mesh(
    new ConeGeometry(0.35 + h * 0.2, 1.6 + len * 0.25, 10, 1, true).rotateZ(Math.PI / 2).translate(-(0.8 + len * 0.12), 0, 0),
    new MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false }),
  );
  flame.position.set(-len, lay.originY * 0.75, 0);
  flame.visible = false;
  const r = Math.max(len, w) * 1.15;
  const aura = new Mesh(
    new SphereGeometry(1, 16, 10).scale(r, r * 0.7, Math.max(w * 1.6, r * 0.6)),
    new MeshBasicMaterial({ color: '#9c27ff', transparent: true, opacity: 0.3, blending: AdditiveBlending, depthWrite: false }),
  );
  aura.position.set(0, lay.originY, 0);
  aura.visible = false;
  return { flame, aura };
}
