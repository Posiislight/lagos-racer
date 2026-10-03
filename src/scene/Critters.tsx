import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, Euler, InstancedMesh, Matrix4, MeshStandardMaterial,
  Quaternion, SphereGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getRace } from '../game/runtime';

const MAX = 24;
const _m = new Matrix4(), _leg = new Matrix4(), _q = new Quaternion(), _e = new Euler(), _p = new Vector3(), _s = new Vector3(), _one = new Vector3(1, 1, 1);

/** Bake a primitive into a vertex-coloured, non-indexed piece of a merged body. */
function part(g: BufferGeometry, color: string, pos: [number, number, number], scale: [number, number, number] = [1, 1, 1], rot: [number, number, number] = [0, 0, 0]) {
  const geo = g.toNonIndexed();
  geo.applyMatrix4(new Matrix4().compose(new Vector3(...pos), new Quaternion().setFromEuler(new Euler(...rot)), new Vector3(...scale)));
  const c = new Color(color), n = geo.attributes.position.count, cols = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) cols.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new BufferAttribute(cols, 3));
  geo.deleteAttribute('uv');
  return geo;
}

function goatBody() {
  const S = (r = 1) => new SphereGeometry(r, 12, 8);
  return mergeGeometries([
    part(S(), '#f4f1ea', [0, 0.56, 0], [0.42, 0.25, 0.21]),
    part(S(), '#8a5a33', [-0.08, 0.66, 0], [0.24, 0.13, 0.215]),          // brown saddle patch
    part(new CylinderGeometry(0.07, 0.09, 0.26, 8), '#f4f1ea', [0.36, 0.7, 0], [1, 1, 1], [0, 0, -0.7]),
    part(S(), '#f4f1ea', [0.47, 0.8, 0], [0.16, 0.12, 0.1]),             // head
    part(S(), '#e8ddd0', [0.6, 0.76, 0], [0.08, 0.06, 0.07]),            // snout
    part(S(), '#2a1d14', [0.53, 0.83, 0.065], [0.022, 0.026, 0.022]),    // eyes
    part(S(), '#2a1d14', [0.53, 0.83, -0.065], [0.022, 0.026, 0.022]),
    part(S(), '#8a5a33', [0.44, 0.82, 0.12], [0.09, 0.03, 0.05], [0.4, 0, 0]),   // floppy ears
    part(S(), '#8a5a33', [0.44, 0.82, -0.12], [0.09, 0.03, 0.05], [-0.4, 0, 0]),
    part(new ConeGeometry(0.025, 0.16, 6), '#5b4a3a', [0.43, 0.94, 0.05], [1, 1, 1], [0.2, 0, 0.8]),  // horns swept back
    part(new ConeGeometry(0.025, 0.16, 6), '#5b4a3a', [0.43, 0.94, -0.05], [1, 1, 1], [-0.2, 0, 0.8]),
    part(new ConeGeometry(0.03, 0.12, 6), '#d8cfc2', [0.58, 0.67, 0], [1, 1, 1], [0, 0, Math.PI]),     // beard
    part(new ConeGeometry(0.035, 0.14, 6), '#f4f1ea', [-0.42, 0.7, 0], [1, 1, 1], [0, 0, 0.6]),       // tail up
  ])!;
}

function chickenBody() {
  const S = (r = 1) => new SphereGeometry(r, 10, 7);
  return mergeGeometries([
    part(S(), '#fbf7ef', [0, 0.28, 0], [0.17, 0.14, 0.12]),
    part(S(), '#efe6d6', [0.0, 0.29, 0.1], [0.12, 0.07, 0.03]),            // wings
    part(S(), '#efe6d6', [0.0, 0.29, -0.1], [0.12, 0.07, 0.03]),
    part(new ConeGeometry(0.08, 0.18, 6), '#2e2e2e', [-0.16, 0.38, 0], [1, 1, 0.4], [0, 0, 0.7]),   // dark tail feathers
    part(S(), '#fbf7ef', [0.13, 0.43, 0], [0.075, 0.08, 0.07]),          // head
    part(S(), '#d81b1b', [0.13, 0.52, 0], [0.05, 0.035, 0.015]),         // comb
    part(S(), '#d81b1b', [0.19, 0.38, 0], [0.02, 0.03, 0.015]),          // wattle
    part(new ConeGeometry(0.022, 0.06, 6), '#f2b400', [0.21, 0.43, 0], [1, 1, 1], [0, 0, -Math.PI / 2]),
    part(S(), '#141414', [0.17, 0.45, 0.04], [0.012, 0.014, 0.012]),
    part(S(), '#141414', [0.17, 0.45, -0.04], [0.012, 0.014, 0.012]),
  ])!;
}

// Leg layouts in the body's space: hip position, length and gait phase offset.
const GOAT_LEGS = [[0.24, 0.12, 0], [0.24, -0.12, Math.PI], [-0.24, 0.12, Math.PI], [-0.24, -0.12, 0]] as const;
const CHICKEN_LEGS = [[0, 0.05, 0], [0, -0.05, Math.PI]] as const;
const TINTS = { goat: ['#ffffff', '#ffffff', '#c89a6a', '#5b4636'], chicken: ['#ffffff', '#d08a45', '#ffffff', '#8a4b24'] };

export function Critters() {
  const goats = useRef<InstancedMesh>(null), goatLegs = useRef<InstancedMesh>(null);
  const chickens = useRef<InstancedMesh>(null), chickenLegs = useRef<InstancedMesh>(null);
  const assets = useMemo(() => {
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    const goatLeg = new CylinderGeometry(0.035, 0.03, 0.42, 6).translate(0, -0.21, 0);
    const chickenLeg = new CylinderGeometry(0.012, 0.012, 0.16, 5).translate(0, -0.08, 0);
    return { mat, goat: goatBody(), chicken: chickenBody(), goatLeg, chickenLeg,
      goatLegMat: new MeshStandardMaterial({ color: '#e9e3d8', roughness: 0.8 }), chickenLegMat: new MeshStandardMaterial({ color: '#f2b400', roughness: 0.6 }) };
  }, []);

  useFrame(() => {
    const race = getRace();
    if (!race || !goats.current || !goatLegs.current || !chickens.current || !chickenLegs.current) return;
    let ng = 0, ngl = 0, nc = 0, ncl = 0;
    for (const c of race.critters) {
      if (c.state === 'gone') continue;
      const goat = c.kind === 'goat';
      const walking = c.state === 'walk' && c.timer <= 0;
      const bob = walking ? Math.abs(Math.sin(c.phase)) * (goat ? 0.03 : 0.025) : 0;
      _e.set(c.state === 'fly' ? c.yaw * 0.7 : 0, c.yaw, c.state === 'fly' ? c.yaw * 1.3 : 0, 'YXZ');
      _q.setFromEuler(_e);
      _m.compose(_p.set(c.x, c.y + bob, c.z), _q, _one);
      const tint = TINTS[c.kind][c.id % 4];
      if (goat && ng < MAX) {
        goats.current.setMatrixAt(ng, _m); goats.current.setColorAt(ng, _tint.set(tint)); ng++;
        for (const [lx, lz, ph] of GOAT_LEGS) {
          const swing = walking ? Math.sin(c.phase + ph) * 0.45 : c.state === 'fly' ? 0.9 : 0;
          _leg.compose(_p.set(lx, 0.44, lz), _q.setFromEuler(_e.set(0, 0, swing)), _s.set(1, 1, 1)).premultiply(_m);
          goatLegs.current.setMatrixAt(ngl++, _leg);
        }
      } else if (!goat && nc < MAX) {
        chickens.current.setMatrixAt(nc, _m); chickens.current.setColorAt(nc, _tint.set(tint)); nc++;
        for (const [lx, lz, ph] of CHICKEN_LEGS) {
          const swing = walking ? Math.sin(c.phase + ph) * 0.7 : 0;
          _leg.compose(_p.set(lx, 0.17, lz), _q.setFromEuler(_e.set(0, 0, swing)), _s.set(1, 1, 1)).premultiply(_m);
          chickenLegs.current.setMatrixAt(ncl++, _leg);
        }
      }
    }
    for (const [mesh, n] of [[goats.current, ng], [goatLegs.current, ngl], [chickens.current, nc], [chickenLegs.current, ncl]] as const) {
      mesh.count = n; mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group>
      <instancedMesh ref={goats} args={[assets.goat, assets.mat, MAX]} castShadow frustumCulled={false} />
      <instancedMesh ref={goatLegs} args={[assets.goatLeg, assets.goatLegMat, MAX * 4]} castShadow frustumCulled={false} />
      <instancedMesh ref={chickens} args={[assets.chicken, assets.mat, MAX]} castShadow frustumCulled={false} />
      <instancedMesh ref={chickenLegs} args={[assets.chickenLeg, assets.chickenLegMat, MAX * 2]} frustumCulled={false} />
    </group>
  );
}

const _tint = new Color();
