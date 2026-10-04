import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ACESFilmicToneMapping, Box3, Group, Vector3 } from 'three';
import { buildVehicleModel } from '../models';
import { vehicleById, type VehicleId } from '../config/vehicles';

/** A vehicle slowly turning on a yellow-and-black kerb turntable. */
function Turntable({ id, color }: { id: VehicleId; color: string }) {
  const spin = useRef<Group>(null);
  const model = useMemo(() => {
    const m = buildVehicleModel(id, color, 1);
    const box = new Box3().setFromObject(m.root), size = box.getSize(new Vector3()), centre = box.getCenter(new Vector3());
    m.root.position.set(-centre.x, 0, -centre.z);
    const k = 3.2 / Math.max(size.x, size.z * 1.4, size.y * 1.2);
    return { ...m, k };
  }, [id, color]);
  const kerbs = useMemo(() => Array.from({ length: 28 }, (_, i) => i), []);
  useFrame(({ clock }, dt) => {
    if (spin.current) spin.current.rotation.y += dt * 0.45;
    model.anim?.(clock.elapsedTime);
    for (const w of model.wheels) w.obj.rotation.z -= dt * 2;
  });
  return (
    <group ref={spin}>
      <group scale={model.k}><primitive object={model.root} /></group>
      <mesh position={[0, -0.04, 0]} receiveShadow>
        <cylinderGeometry args={[2.3, 2.3, 0.08, 56]} />
        <meshStandardMaterial color="#4a4744" roughness={0.95} />
      </mesh>
      {kerbs.map(i => {
        const a = (i / kerbs.length) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 2.38, 0.02, Math.sin(a) * 2.38]} rotation={[0, -a + Math.PI / 2, 0]} castShadow>
            <boxGeometry args={[0.5, 0.14, 0.2]} />
            <meshStandardMaterial color={i % 2 ? '#f2c200' : '#1d1d1d'} roughness={0.4} />
          </mesh>
        );
      })}
    </group>
  );
}

export default function Preview({ id, color }: { id: VehicleId; color: string }) {
  const v = vehicleById(id);
  return (
    <Canvas
      className="preview"
      shadows
      dpr={[1, 1.75]}
      camera={{ fov: 30, position: [6.4, 3.1, 6.4] }}
      gl={{ antialias: true, alpha: true, toneMapping: ACESFilmicToneMapping }}
      onCreated={({ camera }) => camera.lookAt(0, 0.7, 0)}
      aria-label={`3D preview of the ${v.name}`}
    >
      <hemisphereLight args={['#fff6e8', '#7a5a40', 1.6]} />
      <directionalLight position={[4, 8, 3]} intensity={3} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0005} />
      <directionalLight position={[-5, 3, -4]} intensity={0.8} color="#bcdcff" />
      <Turntable id={id} color={color} />
    </Canvas>
  );
}
