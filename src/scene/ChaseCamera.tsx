import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MathUtils, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { getRace } from '../game/runtime';
import { project } from '../game/track';

const _pos = new Vector3(), _q = new Quaternion(), _fwd = new Vector3(), _want = new Vector3(), _look = new Vector3();

/**
 * Chase camera: sits behind and above the player, follows the direction of travel with some lag
 * (so drifts and spins read clearly), and widens its field of view with speed.
 */
export function ChaseCamera() {
  const camera = useThree(s => s.camera) as PerspectiveCamera;
  const heading = useRef<Vector3 | null>(null);
  const look = useRef(new Vector3());

  useFrame((_, dtRaw) => {
    const race = getRace();
    const player = race?.racers.find(r => r.isPlayer);
    const vis = player?.visual;
    if (!race || !player || !vis) return;
    const dt = Math.min(dtRaw, 0.05);
    const cam = player.vehicle.camera;
    vis.getWorldPosition(_pos);
    vis.getWorldQuaternion(_q);
    _fwd.set(1, 0, 0).applyQuaternion(_q).setY(0).normalize();

    // Ease the heading towards the car's nose; slower while spinning out so the view stays calm.
    if (!heading.current) heading.current = _fwd.clone();
    const rate = player.slip > 0 ? 2.2 : 4.5;
    heading.current.lerp(_fwd, 1 - Math.exp(-rate * dt)).normalize();
    const h = heading.current;

    const speed = Math.abs(player.speed);
    const dist = cam.distance * (1 + Math.min(speed / 40, 0.25));
    _want.set(_pos.x - h.x * dist, _pos.y + cam.height, _pos.z - h.z * dist);
    // Don't drop below the road even on a bump.
    _want.y = Math.max(_want.y, _pos.y + 1);
    // Tight streets: never let the camera swing out past the kerb into shop fronts and poles.
    const p = project(race.track, _want.x, _want.z, player.progress.index, 30);
    const limit = race.config.halfWidth + 0.2;
    if (Math.abs(p.lateral) > limit) {
      const at = race.track.points[p.index], push = p.lateral - Math.sign(p.lateral) * limit;
      _want.x -= at.right.x * push; _want.z -= at.right.z * push;
    }
    camera.position.lerp(_want, 1 - Math.exp(-10 * dt));

    _look.set(_pos.x + h.x * cam.lookAhead, _pos.y + cam.height * 0.35, _pos.z + h.z * cam.lookAhead);
    look.current.lerp(_look, 1 - Math.exp(-14 * dt));
    camera.lookAt(look.current);

    const fov = MathUtils.lerp(62, 74, Math.min(1, speed / 32));
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix(); }
  });
  return null;
}
