import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import { buildBRT, buildDanfo, buildKeke, buildOkada } from './generated/showroom.js';
import { findAnimated, mergeDecals, mergeStatic } from './optimize';

import type { VehicleId } from '../config/vehicles';
import type { DriverId } from '../config/drivers';

export type VehicleModel = {
  /** Wrapper group: faces +x, right side on +z, ground at y = 0, scaled for the game. */
  root: Group;
  /** Spinning wheel groups (axle along z) to turn with road speed. */
  wheels: { obj: Object3D; radius: number }[];
  /** The builder's idle animation (conductor waving, bounce). */
  anim?: (t: number) => void;
  /** Size of the scaled model. */
  size: Vector3;
};

const WHEEL_MAT = new MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.4 });

/** Each builder takes the body colour (paint) and, optionally, which driver character sits in it. */
const BUILDERS: Record<VehicleId, (color: string, driver?: DriverId) => Group> = {
  okada: (c, d) => buildOkada(c, d),
  keke: (c, d) => buildKeke(c, d),
  danfo: (c, d) => buildDanfo(c, d),
  brt: (c, d) => buildBRT(c, '01', d),
};

/**
 * Build a showroom vehicle for the game in the given paint colour. The showroom builders put the kerb
 * side on -z and the showroom mirrors them, so do the same here (and flip text decals back so they
 * still read).
 */
export function buildVehicleModel(id: VehicleId, color: string, scale = 1, opts: { merge?: boolean; shadowProxy?: boolean; driver?: DriverId } = {}): VehicleModel {
  const model = BUILDERS[id](color, opts.driver);
  const anim = model.userData.anim as ((t: number) => void) | undefined;

  const wheels: VehicleModel['wheels'] = [];
  model.traverse(o => {
    if (o.userData.wheel) {
      const r = new Box3().setFromObject(o).getSize(new Vector3());
      wheels.push({ obj: o, radius: Math.max(r.x, r.y) / 2 || 0.3 });
    }
  });

  // Flip text decals now (they get mirrored back with the model below), so they can be merged.
  model.traverse(o => { if (o.userData.decal) o.scale.x *= -1; });
  if (opts.merge !== false) {
    const dynamic = findAnimated(model, anim);
    wheels.forEach(w => dynamic.add(w.obj));
    mergeDecals(model, dynamic);
    for (const w of wheels) mergeStatic(w.obj, new Set(), { flatColors: true, single: WHEEL_MAT });
    mergeStatic(model, dynamic, { flatColors: true });
  }

  const root = new Group();
  root.add(model);
  model.scale.z = -1;
  root.scale.setScalar(scale);
  root.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(root), size = bounds.getSize(new Vector3());
  if (opts.shadowProxy) {
    // One invisible box casts the vehicle's shadow instead of its ~50 parts (the shadow pass is
    // the expensive one on phones). It writes nothing to the screen.
    root.traverse(o => { o.castShadow = false; });
    // Narrow vehicles (the okada) get a slimmer caster so the shadow isn't a big rectangle.
    const slim = size.z < size.x * 0.4 ? 0.45 : 0.8;
    const proxy = new Mesh(new BoxGeometry(size.x * 0.85, size.y * 0.7, size.z * slim), new MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    const centre = bounds.getCenter(new Vector3());
    root.worldToLocal(centre);
    proxy.position.set(centre.x, centre.y - size.y * 0.1 / scale, centre.z);
    proxy.scale.setScalar(1 / scale);
    proxy.castShadow = true;
    root.add(proxy);
  } else {
    root.traverse(o => { o.castShadow = o.castShadow && !o.userData.decal; });
  }
  return { root, wheels, anim, size };
}

/** Dev only: how many meshes a built, merged model has (to check a driver doesn't blow the draw-call budget). */
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __meshCount: (id: string, driver?: string) => number }).__meshCount = (id, driver) => {
    let n = 0;
    buildVehicleModel(id as VehicleId, '#d92b2b', 1, { driver: driver as DriverId | undefined }).root.traverse(o => { if ((o as Mesh).isMesh) n++; });
    return n;
  };
}
