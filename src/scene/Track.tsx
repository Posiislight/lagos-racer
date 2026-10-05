import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody, TrimeshCollider } from '@react-three/rapier';
import { DoubleSide, Mesh, MeshStandardMaterial, PlaneGeometry, type Texture } from 'three';
import type { TrackConfig } from '../config/tracks';
import { sampleAt, type Track as TrackData } from '../game/track';
import { medianMask, roadRangeMask } from '../game/outAndBack';
import {
  asphaltTexture, canvasTex, groundTexture, kerbConcreteTexture, ribbon, stripeTexture, surfaceCollider, sweep, terrainGeometry, wallBoxes,
} from './trackGeometry';
import { KERB, PAVEMENT, buildScenery } from './scenery';
import { pavementTexture } from './art/textures';
import { buildLagoon, deckMeshes, lagoonSurface, lagoonTerrain, makeLand, raisedMask } from './lagoon';

// Concrete kerb cross-section: [outwards, up] from the road edge.
const KERB_PROFILE: [number, number][] = [[0, 0], [0.02, 0.16], [0.08, 0.18], [KERB, 0.18]];
/** Half of a low concrete median barrier, from the road edge to the median's centre line. */
const BARRIER_PROFILE: [number, number][] = [[0.1, 0], [0.13, 0.85], [0.22, 0.95], [0.8, 0.95]];

/**
 * The road and its edges. Ojuelegba has no crash barriers: a plain concrete kerb, a narrow raised
 * pavement with the gutter, then shop fronts. The kerb line is the edge of the track (an invisible
 * wall), and everything follows the road's gentle hills.
 */
export function Track({ cfg, track, density, animateWater = true }: { cfg: TrackConfig; track: TrackData; density: number; animateWater?: boolean }) {
  // Out-and-back roads: where the other leg runs alongside, the left edge is a painted median
  // (black and white, red and white on one stretch) instead of pavement. Each leg draws its half.
  const median = useMemo(() => cfg.median ? medianMask(track, cfg.halfWidth, cfg.median.width) : null, [cfg, track]);
  // The road, the colliders and the textures are built once per race. Only the scenery and the lagoon's
  // props depend on `density` (the graphics level, which can drop mid-race), so they are built apart:
  // changing the level must not rebuild the road or swap the physics colliders under the cars.
  const parts = useMemo(() => {
    const hw = cfg.halfWidth;
    const water = cfg.setting?.water;
    const land = water ? makeLand(track, water) : null;
    // Over water the ramps and the deck are raised concrete with parapets; the kerbs and pavements stay at ground level.
    const raised = water ? raisedMask(track) : null;
    const grounded = raised?.map(v => !v);
    // The causeway is a low road in the lagoon: it gets a rocky bank sloping into the water, in place of pavement.
    const onCauseway = water && land ? track.points.map((p, i) => !raised![i] && !land.isLand(p.pos.x, p.pos.z)) : null;
    const tex = { road: asphaltTexture(), kerb: kerbConcreteTexture(), ground: groundTexture(cfg.ground), pave: pavementTexture() };
    const mat = (map: Texture, o: Partial<MeshStandardMaterial> = {}) => new MeshStandardMaterial({ map, roughness: 0.9, ...o });
    const notMedian = median?.map(m => !m);
    const redWhite = median && cfg.median?.redWhite && cfg.axis ? roadRangeMask(track, cfg.axis, cfg.median.redWhite, 2 * hw + cfg.median.width) : null;
    const barrier = median && cfg.median?.barrier && cfg.axis ? roadRangeMask(track, cfg.axis, cfg.median.barrier, 2 * hw + cfg.median.width) : null;
    const bw = median?.map((m, i) => m && !redWhite?.[i] && !barrier?.[i]), rw = median?.map((m, i) => m && !!redWhite?.[i]);
    const wall = barrier && median ? median.map((m, i) => m && barrier[i]) : null;
    const medianParts = median && cfg.median ? [
      new Mesh(sweep(track, hw, -1, KERB_PROFILE, 3, bw), mat(stripeTexture('#f5f5f0', '#1d1d1d'), { roughness: 0.6 })),
      new Mesh(sweep(track, hw, -1, KERB_PROFILE, 3, rw), mat(stripeTexture('#f5f5f0', '#c62828'), { roughness: 0.6 })),
      new Mesh(ribbon(track, -(hw + KERB), -(hw + cfg.median.width / 2), 0.18, 3, median), mat(tex.kerb)),
      ...(wall ? [new Mesh(sweep(track, hw, -1, BARRIER_PROFILE, 3, wall), mat(tex.kerb, { roughness: 0.95 }))] : []),
    ] : [];
    return {
      road: new Mesh(ribbon(track, -hw, hw, 0.02, 14), mat(tex.road, { roughness: 0.85 })),
      kerbL: new Mesh(sweep(track, hw, -1, KERB_PROFILE, 3, mask(notMedian, grounded)), mat(tex.kerb)),
      kerbR: new Mesh(sweep(track, hw, 1, KERB_PROFILE, 3, grounded ?? undefined), mat(tex.kerb)),
      medianParts,
      // Pavement: gutter next to the kerb, out to the shop fronts.
      paveL: new Mesh(ribbon(track, -(hw + KERB), -(hw + PAVEMENT + 0.6), 0.18, 6, mask(notMedian, grounded)), mat(tex.pave)),
      paveR: new Mesh(ribbon(track, hw + KERB, hw + PAVEMENT + 0.6, 0.18, 6, grounded ?? undefined), mat(tex.pave)),
      ground: new Mesh(water && land ? lagoonTerrain(track, land, water) : terrainGeometry(track, hw), mat(tex.ground, { roughness: 1, ...(water ? { vertexColors: true } : {}) })),
      land,
      lagoon: water && land ? lagoonParts(track, cfg, tex.road) : null,
      bank: onCauseway ? bankParts(track, hw, onCauseway) : [],
      surface: surfaceCollider(track, -hw - 1.5, hw + 1.5),
      walls: [...wallBoxes(track, -(hw + 0.35)), ...wallBoxes(track, hw + 0.35)],
      startLine: startLine(cfg, track),
    };
  }, [cfg, track, median]);

  const scenery = useMemo(() => buildScenery(cfg, track, density, median), [cfg, track, density, median]);
  const lagoonProps = useMemo(
    () => parts.land && parts.lagoon ? buildLagoon(cfg, track, density, parts.land, parts.lagoon.oncoming) : null,
    [cfg, track, density, parts],
  );

  useFrame((_, dt) => { if (animateWater) parts.lagoon?.surface.scroll(Math.min(dt, 0.05)); });

  useEffect(() => () => {
    scenery.traverse(o => { const m = o as Mesh; if (m.isMesh) m.geometry.dispose(); });
  }, [scenery]);
  useEffect(() => () => {
    lagoonProps?.traverse(o => { const m = o as Mesh; if (m.isMesh) m.geometry.dispose(); });
  }, [lagoonProps]);

  const shadowy = (m: Mesh, cast = false) => { m.receiveShadow = true; m.castShadow = cast; return m; };

  return (
    <group>
      <primitive object={shadowy(parts.ground)} />
      <primitive object={shadowy(parts.road)} />
      <primitive object={shadowy(parts.kerbL)} />
      <primitive object={shadowy(parts.kerbR)} />
      <primitive object={shadowy(parts.paveL)} />
      <primitive object={shadowy(parts.paveR)} />
      {parts.medianParts.map((m, i) => <primitive key={i} object={shadowy(m)} />)}
      {parts.bank.map((m, i) => <primitive key={i} object={shadowy(m)} />)}
      {parts.lagoon && <>
        <primitive object={parts.lagoon.surface.mesh} />
        <primitive object={parts.lagoon.deck} />
        {lagoonProps && <primitive object={lagoonProps} />}
      </>}
      <primitive object={parts.startLine} />
      <primitive object={scenery} />
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

/** Combine two optional sample masks: a sample is on only if it is on in both. */
function mask(a: boolean[] | undefined, b: boolean[] | undefined) {
  return a && b ? a.map((v, i) => v && b[i]) : a ?? b ?? undefined;
}

/** The lagoon: the water, the concrete deck and the props on and around it. */
function lagoonParts(track: TrackData, cfg: TrackConfig, roadTexture: Texture) {
  const deck = deckMeshes(track, cfg.halfWidth, { road: roadTexture, concrete: kerbConcreteTexture() });
  return { surface: lagoonSurface(track, cfg.setting!.water!), deck: deck.group, oncoming: deck.oncoming };
}

/** A rocky bank down into the water along each side of the causeway. */
function bankParts(track: TrackData, hw: number, mask: boolean[]) {
  const rock = new MeshStandardMaterial({ map: kerbConcreteTexture(), color: '#8b8378', roughness: 1, side: DoubleSide });
  const profile: [number, number][] = [[PAVEMENT + 0.6, 0.18], [PAVEMENT + 2.4, -0.7], [PAVEMENT + 7, -3.8]];
  return ([-1, 1] as const).map(side => new Mesh(sweep(track, hw + KERB, side, profile, 4, mask), rock));
}
