import { useEffect, useMemo } from 'react';
import { CuboidCollider, RigidBody, TrimeshCollider } from '@react-three/rapier';
import { Mesh, MeshStandardMaterial, PlaneGeometry, type Texture } from 'three';
import type { TrackConfig } from '../config/tracks';
import { sampleAt, type Track as TrackData } from '../game/track';
import {
  asphaltTexture, canvasTex, groundTexture, kerbConcreteTexture, ribbon, surfaceCollider, sweep, terrainGeometry, wallBoxes,
} from './trackGeometry';
import { KERB, PAVEMENT, buildScenery } from './scenery';
import { pavementTexture } from './art/textures';

// Concrete kerb cross-section: [outwards, up] from the road edge.
const KERB_PROFILE: [number, number][] = [[0, 0], [0.02, 0.16], [0.08, 0.18], [KERB, 0.18]];

/**
 * The road and its edges. Ojuelegba has no crash barriers: a plain concrete kerb, a narrow raised
 * pavement with the gutter, then shop fronts. The kerb line is the edge of the track (an invisible
 * wall), and everything follows the road's gentle hills.
 */
export function Track({ cfg, track, density }: { cfg: TrackConfig; track: TrackData; density: number }) {
  const parts = useMemo(() => {
    const hw = cfg.halfWidth;
    const tex = { road: asphaltTexture(), kerb: kerbConcreteTexture(), ground: groundTexture(cfg.ground), pave: pavementTexture() };
    const mat = (map: Texture, o: Partial<MeshStandardMaterial> = {}) => new MeshStandardMaterial({ map, roughness: 0.9, ...o });
    return {
      road: new Mesh(ribbon(track, -hw, hw, 0.02, 14), mat(tex.road, { roughness: 0.85 })),
      kerbL: new Mesh(sweep(track, hw, -1, KERB_PROFILE, 3), mat(tex.kerb)),
      kerbR: new Mesh(sweep(track, hw, 1, KERB_PROFILE, 3), mat(tex.kerb)),
      // Pavement: gutter next to the kerb, out to the shop fronts.
      paveL: new Mesh(ribbon(track, -(hw + KERB), -(hw + PAVEMENT + 0.6), 0.18, 6), mat(tex.pave)),
      paveR: new Mesh(ribbon(track, hw + KERB, hw + PAVEMENT + 0.6, 0.18, 6), mat(tex.pave)),
      ground: new Mesh(terrainGeometry(track, hw), mat(tex.ground, { roughness: 1 })),
      surface: surfaceCollider(track, -hw - 1.5, hw + 1.5),
      walls: [...wallBoxes(track, -(hw + 0.35)), ...wallBoxes(track, hw + 0.35)],
      scenery: buildScenery(cfg, track, density),
      startLine: startLine(cfg, track),
    };
  }, [cfg, track, density]);

  useEffect(() => () => {
    parts.scenery.traverse(o => { const m = o as Mesh; if (m.isMesh) m.geometry.dispose(); });
  }, [parts]);

  const shadowy = (m: Mesh, cast = false) => { m.receiveShadow = true; m.castShadow = cast; return m; };

  return (
    <group>
      <primitive object={shadowy(parts.ground)} />
      <primitive object={shadowy(parts.road)} />
      <primitive object={shadowy(parts.kerbL)} />
      <primitive object={shadowy(parts.kerbR)} />
      <primitive object={shadowy(parts.paveL)} />
      <primitive object={shadowy(parts.paveR)} />
      <primitive object={parts.startLine} />
      <primitive object={parts.scenery} />
      <RigidBody type="fixed" colliders={false} friction={0.9}>
        <TrimeshCollider args={[parts.surface.vertices, parts.surface.indices]} friction={1} />
        {/* Safety net far below, in case anything ever slips through. */}
        <CuboidCollider args={[900, 1, 900]} position={[0, -12, 0]} />
      </RigidBody>
      <RigidBody type="fixed" colliders={false} userData={{ wall: true }}>
        {parts.walls.map((w, i) => <CuboidCollider key={i} args={w.half} position={w.pos} rotation={[0, w.rotY, 0]} friction={0.05} restitution={0.3} />)}
      </RigidBody>
    </group>
  );
}

function startLine(cfg: TrackConfig, track: TrackData) {
  const at = sampleAt(track, 0);
  const tex = canvasTex(256, 32, x => {
    for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#f5f5f0'; x.fillRect(i * 16, j * 16, 16, 16); }
  });
  const m = new Mesh(new PlaneGeometry(cfg.halfWidth * 2, 2).rotateX(-Math.PI / 2), new MeshStandardMaterial({ map: tex, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.position.set(at.pos.x, at.pos.y + 0.03, at.pos.z);
  // Local x spans the road (it lands on -right, which is fine for a symmetric strip).
  m.rotation.y = Math.atan2(at.tangent.x, at.tangent.z);
  m.receiveShadow = true;
  return m;
}
