import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, RoundCuboidCollider, useAfterPhysicsStep, useBeforePhysicsStep, useRapier, type RapierRigidBody } from '@react-three/rapier';
import type { DynamicRayCastVehicleController } from '@dimforge/rapier3d-compat';
import {
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, CapsuleGeometry, ConeGeometry, Group, MathUtils, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Points, PointsMaterial, Quaternion,
  SphereGeometry, Vector3,
} from 'three';
import { buildVehicleModel } from '../models';
import { getRace, setBodyDriven, type Racer, type RemoteCar } from '../game/runtime';
import { bumpShove } from '../game/bump';
import { sampleAt } from '../game/track';
import { resyncProgress } from '../game/race';
import { playHorn } from '../game/audio';
import type { Pose } from '../net/interpolation';
import { clampContactSpeed } from '../game/contact';
import { NameTag } from './NameTag';
import { speedFactors } from '../game/specials';
import { underPower } from '../game/modes';

const G = 9.81;
const _q = new Quaternion(), _fwd = new Vector3(), _v = new Vector3();
// Reused every physics step for remote cars, so following them allocates nothing.
const _pose: Pose = { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, vx: 0, vy: 0, vz: 0 };
const _rot = { x: 0, y: 0, z: 0, w: 1 }, _away = { x: 0, y: -200, z: 0 };
let _touching = false;
const _onManifold = (m: { numContacts(): number }) => { if (m.numContacts() > 0) _touching = true; };

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

type Spawn = { x: number; y: number; z: number; yaw: number };

export function Vehicle({ racer, spawn, merge = true, quick = false }: { racer: Racer; spawn: Spawn; merge?: boolean; quick?: boolean }) {
  // Another phone drives this one: it follows that phone's snapshots instead of our physics. In a Quick race a bot
  // can be handed to this phone mid-race (NetSession.adopt): useFrame notices and re-renders, and the effect below
  // switches the body over and fits the wheels, keeping the same model.
  const [remote, setRemote] = useState(racer.kind === 'remote');
  // The body's type as first built. Later switches go through setBodyDriven, never this prop: changing it would make
  // @react-three/rapier put the body back where it was last drawn.
  const [bodyType] = useState(remote ? 'kinematicPosition' as const : 'dynamic' as const);
  const body = useRef<RapierRigidBody>(null);
  const visual = useRef<Group>(null);
  const tilt = useRef<Group>(null);
  const controller = useRef<DynamicRayCastVehicleController | null>(null);
  const { world } = useRapier();
  const lay = useMemo(() => layout(racer), [racer]);
  const model = useMemo(() => buildVehicleModel(racer.vehicle.id, racer.paint.color, racer.vehicle.scale, { merge, shadowProxy: true, driver: racer.driver }), [racer.vehicle, racer.paint, racer.driver, merge]);
  const state = useRef({ roll: 0, pitch: 0, yawRate: 0, lastSpeed: 0, hornCooldown: 0, bumpCooldown: 0, removed: false });
  /** Shove this racer away from another one it's touching. */
  const shove = (other: Racer) => {
    const b = body.current, ob = other.body;
    if (!b || !ob) return;
    const t = b.translation(), lv = b.linvel(), ot = ob.translation(), ov = ob.linvel();
    const s = bumpShove({ x: t.x, z: t.z, vx: lv.x, vz: lv.z, mass: racer.vehicle.tuning.mass }, { x: ot.x, z: ot.z, vx: ov.x, vz: ov.z, mass: other.vehicle.tuning.mass }, racer.contactNormal.get(other.id));
    racer.bump.x += s.x; racer.bump.z += s.z;
    state.current.bumpCooldown = 0.25;
  };
  const fx = useMemo(() => effectMeshes(lay), [lay]);
  const [dropped, setDropped] = useState(false);
  // Touching another phone's car: our speed when the contact began, so its push can be capped.
  const push = useRef({ pre: 0, touching: false, before: 0 });

  useEffect(() => {
    const b = body.current;
    if (!b) return;
    racer.body = b;
    racer.visual = visual.current;
    setBodyDriven(b, remote);
    if (remote) return () => { racer.body = null; racer.visual = null; };
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
      // An eliminated car has already had its controller removed (see the useFrame below).
      const alive = controller.current === vc;
      controller.current = null;
      if (alive) try { world.removeVehicleController(vc); } catch { /* world already torn down */ }
      racer.body = null;
      racer.visual = null;
    };
  }, [world, racer, lay, remote]);

  useBeforePhysicsStep(w => {
    if (racer.remote) {
      const b = body.current, net = getRace()?.net;
      if (b && net) followSnapshots(racer, racer.remote, b, net.now(), visual.current, spawn);
      return;
    }
    const vc = controller.current, b = body.current, race = getRace();
    if (!vc || !b || !race) return;
    const dt = w.timestep, t = racer.vehicle.tuning, c = racer.controls;
    // Only a room race needs the pre-step speed: it caps a shove from a remote car.
    if (race.net) {
      const lv0 = b.linvel();
      push.current.pre = Math.hypot(lv0.x, lv0.z);
    }

    if (racer.respawn || b.translation().y < race.track.points[racer.progress.index].pos.y - 5) { respawn(racer, b); racer.respawn = false; racer.respawns++; return; }

    // Still pressed against another vehicle: keep pushing apart a few times a second.
    const st = state.current;
    st.bumpCooldown -= dt;
    if (racer.touching.size && st.bumpCooldown <= 0) for (const id of racer.touching) { const o = race.racers.find(r => r.id === id); if (o) shove(o); }

    const v = vc.currentVehicleSpeed();
    racer.speed = v;
    const speedFrac = Math.min(1, Math.abs(v) / t.topSpeed);
    const racing = underPower(race.phase, racer.outAt);
    const boosting = racer.boost > 0, slippy = racer.slip > 0;
    const f = speedFactors(racer);

    // Steering: full lock when slow, less at speed. Positive wheel angle turns left.
    // Running over animals makes the steering shaky; oil makes the vehicle wander.
    let steerIn = c.steer;
    if (racer.wobble > 0) steerIn += Math.sin(race.clock * 23 + racer.id * 5) * 0.4 * Math.min(1, racer.wobble * 1.5);
    if (slippy) steerIn += Math.sin(race.clock * 6 + racer.id * 3) * 0.35;
    if (racer.cough > 0) steerIn += Math.sin(race.clock * 7 + racer.id * 3) * 0.3 * Math.min(1, racer.cough);
    const steerScale = MathUtils.lerp(1, t.steerAtSpeed, speedFrac);
    const steer = -MathUtils.clamp(steerIn, -1, 1) * t.steer * steerScale;
    vc.setWheelSteering(0, steer); vc.setWheelSteering(1, steer);

    // Engine: strong low down, fading to nothing at top speed. Brake button reverses when stopped.
    // Fuel and Push Squad speed you up; juju and a pepper-soup cough hold you back (see speedFactors).
    const perWheel = t.mass * t.accel / 4 * f.accel;
    let engine = 0, brake = 0;
    if (racing) {
      const top = t.topSpeed * racer.topBoost * f.top;
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
      if (boosting && v < t.topSpeed * f.top) b.applyImpulse({ x: _fwd.x * t.mass * 9 * dt, y: 0, z: _fwd.z * t.mass * 9 * dt }, true);

      // A little downforce keeps the wheels planted over kerbs.
      b.applyImpulse({ x: 0, y: -t.mass * 0.03 * Math.abs(v) * dt, z: 0 }, true);
    }
    // The shove fades out over about 0.4 s.
    const fade = Math.exp(-dt / 0.13);
    racer.bump.x *= fade; racer.bump.z *= fade;
    if (Math.hypot(racer.bump.x, racer.bump.z) < 0.05) racer.bump.x = racer.bump.z = 0;
  });

  // A remote car is kinematic, so it shoves us as if it weighed a million tonnes: cap that push.
  // Checked straight after the step (collision events only arrive once per frame).
  useAfterPhysicsStep(w => {
    const b = body.current, race = getRace();
    if (remote || !b || !race?.net) return;
    const mine = b.collider(0);
    let remoteSpeed = -1;
    for (const o of race.racers) {
      if (o.kind !== 'remote' || !o.body) continue;
      _touching = false;
      w.contactPair(mine, o.body.collider(0), _onManifold);
      if (_touching) remoteSpeed = Math.max(remoteSpeed, Math.abs(o.speed));
    }
    const p = push.current;
    if (remoteSpeed < 0) { p.touching = false; return; }
    if (!p.touching) { p.touching = true; p.before = p.pre; }
    const lv = b.linvel(), out = clampContactSpeed(lv.x, lv.z, p.before, remoteSpeed);
    if (out.vx !== lv.x || out.vz !== lv.z) b.setLinvel({ x: out.vx, y: lv.y, z: out.vz }, true);
  });

  useFrame((st, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05), s = state.current, t = racer.vehicle.tuning;
    const b = body.current;
    if (!b) return;
    // Knocked out (elimination): the LASTMA clamp shows at once; two seconds later the car vanishes
    // and leaves the physics world, so the others can drive through where it stopped. racer.body
    // stays set so the other loops can still read its position.
    fx.clamp.visible = racer.outAt !== null;
    const raceNow = getRace();
    if (racer.outAt !== null && !s.removed && raceNow && raceNow.clock - racer.outAt > 2) {
      s.removed = true;
      racer.speed = 0;
      if (visual.current) visual.current.visible = false;
      const vc = controller.current;
      controller.current = null;
      if (vc) try { world.removeVehicleController(vc); } catch { /* world already torn down */ }
      b.setEnabled(false);
    }
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
    fx.flame.visible = fx.sparks.visible = racer.boost > 0;
    if (fx.flame.visible) {
      // A longer flame than the exhaust glow, flickering, with sparks flying out behind it.
      const th = 0.8 + Math.random() * 0.5;
      fx.flame.scale.set(1.4, th, th);
      const pos = fx.sparks.geometry.attributes.position as BufferAttribute, sp = fx.sparkSpread;
      for (let i = 0; i < SPARKS; i++) pos.setXYZ(i, -(sp.from + Math.random() * (sp.to - sp.from)), (Math.random() - 0.5) * sp.w * 2, (Math.random() - 0.5) * sp.w * 2);
      pos.needsUpdate = true;
    }
    // Moshood's boys run behind and shove while Push Squad lasts.
    fx.boys.visible = racer.push > 0;
    if (fx.boys.visible) fx.boys.children.forEach((boy, i) => { boy.position.y = Math.abs(Math.sin(tt * 14 + i * 2)) * 0.14; });
    fx.aura.visible = racer.curse > 0;
    if (fx.aura.visible) {
      const p = 1 + Math.sin(tt * 9) * 0.08;
      fx.aura.scale.set(p, p, p);
      (fx.aura.material as MeshBasicMaterial).opacity = 0.25 + 0.15 * Math.min(1, racer.curse);
    }
    // The odeshi bubble flickers for its last two seconds as a warning.
    fx.bubble.visible = racer.shield > 0 && (racer.shield > 2 || Math.sin(tt * 26) > -0.2);
    if (fx.bubble.visible) {
      const p = 1 + Math.sin(tt * 5) * 0.03;
      fx.bubble.scale.set(p, p, p);
    }
    model.anim?.(st.clock.elapsedTime);
    // Horn
    s.hornCooldown -= dt;
    if (racer.controls.horn && s.hornCooldown <= 0) { playHorn(racer.vehicle.horn, racer.isPlayer); s.hornCooldown = 0.9; }
    if (racer.remote && racer.remote.dnf !== dropped) setDropped(racer.remote.dnf);
    if ((racer.kind === 'remote') !== remote) setRemote(racer.kind === 'remote');
  });

  return (
    <RigidBody
      ref={body}
      colliders={false}
      position={[spawn.x, spawn.y + lay.originY + 0.15, spawn.z]}
      rotation={[0, spawn.yaw, 0]}
      type={bodyType}
      enabledRotations={[false, true, false]}
      linearDamping={0.05}
      angularDamping={1.5}
      ccd={bodyType === 'dynamic'}
      canSleep={false}
      userData={{ racer: racer.id }}
      onCollisionEnter={({ other, manifold }) => {
        if (remote) return; // another phone works out its own knocks
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
          if (o) {
            // Push apart along the contact normal (shove() points it away from the other vehicle).
            racer.contactNormal.set(o.id, { x: n.x, z: n.z });
            racer.touching.add(o.id); shove(o);
          }
        }
      }}
      onCollisionExit={({ other }) => {
        const ud = other.rigidBody?.userData as { racer?: number } | undefined;
        if (ud?.racer !== undefined) { racer.touching.delete(ud.racer); racer.contactNormal.delete(ud.racer); }
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
          <primitive object={fx.sparks} />
          <primitive object={fx.bubble} />
          <primitive object={fx.boys} />
          <primitive object={fx.clamp} />
        </group>
        {/* Everyone else's name; in a Quick race this phone's bots wear one too, or they would stand out. */}
        {(remote || (quick && !racer.isPlayer)) && !dropped && (
          <group position={[0, model.size.y - lay.originY + 0.5, 0]}>
            <NameTag name={racer.name} />
          </group>
        )}
      </group>
    </RigidBody>
  );
}

/** Another phone's car: replay its snapshots a little behind real time. */
function followSnapshots(racer: Racer, rem: RemoteCar, b: RapierRigidBody, now: number, visual: Object3D | null, spawn: Spawn) {
  if (visual) visual.visible = !rem.dnf;
  if (rem.dnf) {
    // Dropped out of the race: park it far below the track, out of everyone's way.
    _away.x = spawn.x; _away.z = spawn.z;
    b.setNextKinematicTranslation(_away);
    racer.speed = 0;
    return;
  }
  const got = rem.buffer.sample(rem.buffer.renderTimeAt(now), _pose);
  if (got === 'empty') return; // nothing heard yet: wait on the grid
  b.setNextKinematicTranslation(_pose);
  _rot.x = _pose.qx; _rot.y = _pose.qy; _rot.z = _pose.qz; _rot.w = _pose.qw;
  b.setNextKinematicRotation(_rot);
  // Forward speed turns the wheels; a held pose isn't going anywhere.
  _fwd.set(1, 0, 0).applyQuaternion(_q.set(_pose.qx, _pose.qy, _pose.qz, _pose.qw));
  racer.speed = got === 'hold' ? 0 : _pose.vx * _fwd.x + _pose.vy * _fwd.y + _pose.vz * _fwd.z;
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
  racer.trail = 0;
  racer.bump.x = racer.bump.z = 0;
  resyncProgress(race.track, racer.progress, x, z);
}

/** Fuel flame out of the back, a purple juju aura and a blue odeshi bubble, all hidden until needed. */
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
  // Sparks spitting out behind the flame on a boost, scattered afresh every frame.
  const sparkGeo = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(SPARKS * 3), 3));
  const sparks = new Points(sparkGeo, new PointsMaterial({ color: '#ffd27a', size: 0.12, transparent: true, blending: AdditiveBlending, depthWrite: false }));
  sparks.position.copy(flame.position);
  sparks.frustumCulled = false;
  sparks.visible = false;
  const rb = r * 1.12;
  const bubble = new Mesh(
    new SphereGeometry(1, 20, 14).scale(rb, rb * 0.8, Math.max(w * 1.9, rb * 0.7)),
    new MeshBasicMaterial({ color: '#37b6ff', transparent: true, opacity: 0.3, blending: AdditiveBlending, depthWrite: false }),
  );
  bubble.position.set(0, lay.originY, 0);
  bubble.visible = false;
  // Three of the boys, shoving from behind: a capsule body and a round head each, leaning into it.
  const boys = new Group();
  boys.position.set(-(len + 0.8), 0, 0);
  boys.visible = false;
  const body = new CapsuleGeometry(0.2, 0.55, 4, 8), head = new SphereGeometry(0.2, 12, 8);
  ['#e8452c', '#2f9e5b', '#f2b705'].forEach((shirt, i) => {
    const boy = new Group();
    const torso = new Mesh(body, new MeshStandardMaterial({ color: shirt, roughness: 0.7 }));
    torso.position.y = 0.75;
    const skull = new Mesh(head, new MeshStandardMaterial({ color: i === 1 ? '#6b4326' : '#8a5a36', roughness: 0.6 }));
    skull.position.y = 1.4;
    boy.add(torso, skull);
    boy.rotation.z = -0.35;
    boy.position.z = (i - 1) * Math.max(0.7, w * 0.8);
    boys.add(boy);
  });
  // LASTMA's wheel clamp (placeholder): a yellow block bolted on the front left wheel, with a black bar.
  const [wx, wz] = lay.wheels[0], side = Math.sign(wz) || -1;
  const clamp = new Group();
  const block = new Mesh(new BoxGeometry(lay.R * 1.1, lay.R * 1.5, 0.3), new MeshStandardMaterial({ color: '#ffd400', roughness: 0.5, emissive: '#5a4800' }));
  const bar = new Mesh(new BoxGeometry(lay.R * 1.4, 0.12, 0.34), new MeshStandardMaterial({ color: '#141210', roughness: 0.6 }));
  bar.position.y = lay.R * 0.45;
  clamp.add(block, bar);
  clamp.position.set(wx, lay.R * 1.05, wz + side * 0.2);
  clamp.visible = false;
  return { flame, aura, bubble, sparks, boys, clamp, sparkSpread: { from: 1.2 + len * 0.3, to: 2.6 + len * 0.4, w: 0.3 + h * 0.15 } };
}
const SPARKS = 12;
