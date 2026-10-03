import { BufferAttribute, BufferGeometry, Color, DoubleSide, Material, Matrix4, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Merge every static mesh under `root` that shares a material into a single mesh, so a vehicle
 * draws in a few dozen calls instead of a few hundred. Objects in `dynamic` (spinning wheels, a
 * waving arm) keep their own transform; each one is merged separately inside its own space.
 */
export function mergeStatic(root: Object3D, dynamic: Set<Object3D>, opts: { flatColors?: boolean; single?: Material } = {}) {
  root.updateMatrixWorld(true);
  const inv = new Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<Material, { geos: BufferGeometry[]; meshes: Mesh[]; cast: boolean }>();
  const nested: Object3D[] = [];

  const visit = (o: Object3D) => {
    for (const child of [...o.children]) {
      if (dynamic.has(child)) { nested.push(child); continue; }
      const m = child as Mesh;
      if (m.isMesh && !Array.isArray(m.material) && !m.userData.decal) {
        const rel = new Matrix4().multiplyMatrices(inv, m.matrixWorld);
        const g = normalise(m.geometry, rel);
        // Plain colour materials share one vertex-coloured material, so a cell of props in a
        // dozen colours still draws in one call.
        let flat = opts.flatColors ? flatMaterial(m.material) : null;
        // Small spinning parts (wheels) can go further: one material for every piece.
        if (flat && opts.single && flat.material.type !== 'MeshBasicMaterial') flat = { material: opts.single, color: flat.color };
        if (flat) {
          const col = flat.color, n = g.attributes.position.count, cols = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) cols.set([col.r, col.g, col.b], i * 3);
          g.setAttribute('color', new BufferAttribute(cols, 3));
        }
        const key = flat ? flat.material : m.material;
        let b = buckets.get(key);
        if (!b) buckets.set(key, (b = { geos: [], meshes: [], cast: false }));
        b.geos.push(g); b.meshes.push(m); b.cast ||= m.castShadow;
      }
      visit(child);
    }
  };
  visit(root);

  for (const [material, b] of buckets) {
    if (b.meshes.length < 2) { b.geos.forEach(g => g.dispose()); continue; }
    const merged = mergeGeometries(b.geos, false);
    b.geos.forEach(g => g.dispose());
    if (!merged) continue;
    for (const m of b.meshes) {
      m.removeFromParent();
      // Children of a merged mesh (rare) are re-attached to keep them in the scene.
      for (const c of [...m.children]) root.attach(c);
    }
    const mesh = new Mesh(merged, material);
    mesh.castShadow = b.cast; mesh.receiveShadow = true;
    root.add(mesh);
  }
  // Groups left empty after merging are harmless but cost traversal time; drop them.
  pruneEmpty(root, dynamic);
  for (const d of nested) mergeStatic(d, dynamic, opts.single ? { flatColors: opts.flatColors } : opts);
}

/**
 * Pack every decal under `root` (stickers, plates, numbers: each its own canvas texture) into one
 * atlas and merge them into a single mesh. Glowing decals keep their own material.
 */
export function mergeDecals(root: Object3D, dynamic: Set<Object3D>) {
  root.updateMatrixWorld(true);
  const inv = new Matrix4().copy(root.matrixWorld).invert();
  const decals: Mesh[] = [];
  const visit = (o: Object3D) => {
    for (const c of o.children) {
      if (dynamic.has(c)) continue;
      const m = c as Mesh, mat = m.material as MeshStandardMaterial;
      if (m.isMesh && m.userData.decal && mat.map && !mat.emissiveMap && (mat.map.image as HTMLCanvasElement)?.width) decals.push(m);
      visit(c);
    }
  };
  visit(root);
  if (decals.length < 2) return;

  // Shelf-pack the canvases (scaled to at most 256 px tall) into a 2048-wide atlas.
  const W = 2048, PAD = 2;
  const items = decals.map(m => {
    const img = (m.material as MeshStandardMaterial).map!.image as HTMLCanvasElement;
    const k = Math.min(1, 256 / img.height, (W - PAD * 2) / img.width);
    return { m, img, w: Math.ceil(img.width * k), h: Math.ceil(img.height * k), x: 0, y: 0 };
  }).sort((a, b) => b.h - a.h);
  let x = PAD, y = PAD, rowH = 0;
  for (const it of items) {
    if (x + it.w + PAD > W) { x = PAD; y += rowH + PAD; rowH = 0; }
    it.x = x; it.y = y; x += it.w + PAD; rowH = Math.max(rowH, it.h);
  }
  const H = Math.pow(2, Math.ceil(Math.log2(y + rowH + PAD)));
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  for (const it of items) ctx.drawImage(it.img, it.x, it.y, it.w, it.h);

  const geos = items.map(it => {
    const g = normalise(it.m.geometry, new Matrix4().multiplyMatrices(inv, it.m.matrixWorld));
    const uv = g.attributes.uv as BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (it.x + uv.getX(i) * it.w) / W, 1 - (it.y + (1 - uv.getY(i)) * it.h) / H);
    return g;
  });
  const merged = mergeGeometries(geos, false);
  geos.forEach(g => g.dispose());
  if (!merged) return;
  const first = decals[0].material as MeshStandardMaterial;
  const tex = first.map!.clone();
  tex.image = canvas; tex.needsUpdate = true;
  const mat = first.clone();
  mat.map = tex; mat.alphaTest = 0.05;
  decals.forEach(d => d.removeFromParent());
  const mesh = new Mesh(merged, mat);
  mesh.receiveShadow = true;
  root.add(mesh);
}

const flatShared = new Map<string, Material>();
const _glow = new Color();
/**
 * The shared vertex-colour twin of a plain (untextured) material and the colour to bake in, or
 * null if the material has to stay as it is. Roughness and metalness are rounded into a few
 * buckets so a vehicle's many slightly different plastics and metals merge together, and every
 * small light (headlamps, LEDs, underglow) shares one unlit glow material.
 */
function flatMaterial(mat: Material): { material: Material; color: Color } | null {
  const s = mat as MeshPhysicalMaterial;
  if (!s.isMeshStandardMaterial) return null;
  if (s.map || s.transparent || s.vertexColors || s.alphaTest > 0 || s.userData.castShadow) return null;
  if (s.emissive.getHex() !== 0) {
    let glow = flatShared.get("glow");
    if (!glow) flatShared.set("glow", (glow = new MeshBasicMaterial({ vertexColors: true, toneMapped: false })));
    _glow.copy(s.color).multiplyScalar(0.35).add(s.emissive.clone().multiplyScalar(Math.min(1.6, s.emissiveIntensity)));
    return { material: glow, color: new Color(Math.min(1, _glow.r), Math.min(1, _glow.g), Math.min(1, _glow.b)) };
  }
  const phys = !!s.isMeshPhysicalMaterial && s.clearcoat > 0.5;
  const rough = Math.round(s.roughness * 4) / 4, metal = s.metalness > 0.5 ? 1 : s.metalness > 0.15 ? 0.3 : 0;
  const key = [phys ? "p" : "s", rough, metal].join("|");
  let out = flatShared.get(key);
  if (!out) {
    const o = { vertexColors: true, roughness: Math.max(0.08, rough), metalness: metal, side: DoubleSide };
    out = phys ? new MeshPhysicalMaterial({ ...o, clearcoat: 1, clearcoatRoughness: 0.1 }) : new MeshStandardMaterial(o);
    flatShared.set(key, out);
  }
  return { material: out, color: s.color };
}

/** Bake a transform into a non-indexed copy with position, normal, uv (and colour, if baked). */
function normalise(src: BufferGeometry, m: Matrix4): BufferGeometry {
  const g = src.index ? src.toNonIndexed() : src.clone();
  // Keep baked vertex colours; drop anything else so geometries in a bucket line up.
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.morphAttributes = {};
  g.clearGroups();
  g.applyMatrix4(m);
  // A mirrored transform flips triangle winding; swap two corners so faces still point outwards.
  if (m.determinant() < 0) {
    for (const name of ['position', 'normal', 'uv', 'color']) {
      const a = g.attributes[name] as BufferAttribute | undefined;
      if (!a) continue;
      const s = a.itemSize, arr = a.array as Float32Array;
      for (let i = 0; i < a.count; i += 3) for (let k = 0; k < s; k++) {
        const t = arr[(i + 1) * s + k]; arr[(i + 1) * s + k] = arr[(i + 2) * s + k]; arr[(i + 2) * s + k] = t;
      }
      a.needsUpdate = true;
    }
  }
  return g;
}

function pruneEmpty(o: Object3D, keep: Set<Object3D>) {
  for (const c of [...o.children]) {
    pruneEmpty(c, keep);
    if (!keep.has(c) && c.type === 'Group' && c.children.length === 0 && Object.keys(c.userData).length === 0) c.removeFromParent();
  }
}

/**
 * Find objects that a builder's idle animation moves: run it at two different times and compare
 * every object's local transform. The root itself is allowed to move (it carries everything).
 */
export function findAnimated(root: Object3D, anim?: (t: number) => void): Set<Object3D> {
  const moved = new Set<Object3D>();
  if (!anim) return moved;
  const snap = new Map<Object3D, number[]>();
  anim(0);
  root.traverse(o => { o.updateMatrix(); snap.set(o, o.matrix.toArray()); });
  for (const t of [0.37, 1.234, 2.71]) {
    anim(t);
    root.traverse(o => {
      if (o === root) return;
      o.updateMatrix();
      const before = snap.get(o);
      if (before && o.matrix.elements.some((v, i) => Math.abs(v - before[i]) > 1e-6)) moved.add(o);
    });
  }
  anim(0);
  return moved;
}
