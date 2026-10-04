import {
  BoxGeometry, BufferAttribute, BufferGeometry, CylinderGeometry, DoubleSide, Group, Material, Mesh, MeshStandardMaterial,
  PlaneGeometry, RepeatWrapping, SphereGeometry, type Texture,
} from 'three';
import type { TrackConfig, Water } from '../config/tracks';
import { sampleAt, type Track } from '../game/track';
import { canvasTex, ribbon, rng, sweep } from './trackGeometry';
import { RAISED, chunkAndMerge, parkedDanfo, type MatFn } from './scenery';
import { directionSign } from './landmarks';

/**
 * Everything that makes the Third Mainland Bridge a different place from the street tracks: the lagoon
 * and the land that rises out of it, the concrete deck with its parapets and piers, the other carriageway
 * jammed with traffic, and the canoes and stilt houses of the water village.
 */

// ---- Land and water ----

const LAND_TOP = -0.4, SEA_FLOOR = -9, SHORE = 40;

export type Land = {
  /** Ground height at (x, z): flat land, a beach that slopes away, then the lagoon floor. */
  height: (x: number, z: number) => number;
  /** Whether (x, z) is above the water. */
  isLand: (x: number, z: number) => boolean;
};

/** Land is the discs and the banks along stretches of the road; everything else is water. */
export function makeLand(track: Track, water: Water): Land {
  const sources: [number, number, number][] = water.land.discs.map(d => [d[0], d[1], d[2]]);
  for (const [from, to, hw] of water.land.banks) {
    for (let i = 0; i < track.points.length; i += 4) {
      const p = track.points[i];
      if (p.s >= from && p.s <= to) sources.push([p.pos.x, p.pos.z, hw]);
    }
  }
  const height = (x: number, z: number) => {
    // A wobble in the shoreline, so it isn't a row of circles.
    const wob = 7 * Math.sin(x * 0.045 + z * 0.031) + 5 * Math.sin(x * 0.093 - z * 0.071 + 1.3);
    let v = 0;
    for (const [sx, sz, r] of sources) {
      v = Math.max(v, 1 - (Math.hypot(x - sx, z - sz) - r + wob) / SHORE);
      if (v >= 1) break;
    }
    const k = Math.min(1, Math.max(0, v)); const e = k * k * (3 - 2 * k);
    return SEA_FLOOR + (LAND_TOP - SEA_FLOOR) * e;
  };
  return { height, isLand: (x, z) => height(x, z) > water.level + 0.3 };
}

/** The ground: land, beaches and the lagoon floor, as a height grid with sand and grass tints. */
export function lagoonTerrain(track: Track, land: Land, water: Water, margin = 260, cell = 6): BufferGeometry {
  const xs = track.points.map(p => p.pos.x), zs = track.points.map(p => p.pos.z);
  const x0 = Math.min(...xs) - margin, z0 = Math.min(...zs) - margin;
  const nx = Math.ceil((Math.max(...xs) + margin - x0) / cell), nz = Math.ceil((Math.max(...zs) + margin - z0) / cell);
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3), uv = new Float32Array((nx + 1) * (nz + 1) * 2), col = new Float32Array((nx + 1) * (nz + 1) * 3), idx: number[] = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = x0 + i * cell, z = z0 + j * cell, h = land.height(x, z), k = j * (nx + 1) + i;
    pos.set([x, h, z], k * 3);
    uv.set([x / 23, z / 23], k * 2);
    // Wet dark sand at the waterline, dry sand above it, grass further in.
    const dry = Math.min(1, Math.max(0, (h - water.level) / 1.2)), grass = Math.min(1, Math.max(0, (h - water.level - 1.2) / 1.2));
    col.set([0.62 + 0.38 * dry - 0.2 * grass, 0.6 + 0.4 * dry + 0.0 * grass, 0.55 + 0.45 * dry - 0.35 * grass], k * 3);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** The lagoon's surface: one big glossy plane whose ripples drift. Call `scroll(dt)` each frame to animate it. */
export function lagoonSurface(track: Track, water: Water) {
  const tex: Texture = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#f3f7f9'; x.fillRect(0, 0, w, h);
    const r = rng(21);
    for (let i = 0; i < 160; i++) {
      x.strokeStyle = `rgba(${r() < 0.5 ? '255,255,255' : '120,170,190'},${0.25 + r() * 0.4})`; x.lineWidth = 1 + r() * 2;
      const px = r() * w, py = r() * h, len = 10 + r() * 26;
      // Tile seamlessly: draw each ripple at all nine wraps.
      for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) { x.beginPath(); x.moveTo(px + dx, py + dy); x.quadraticCurveTo(px + dx + len / 2, py + dy - 3, px + dx + len, py + dy); x.stroke(); }
    }
  }, true);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  const xs = track.points.map(p => p.pos.x), zs = track.points.map(p => p.pos.z);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) + 1800;
  tex.repeat.set(size / 28, size / 28);
  const mesh = new Mesh(new PlaneGeometry(size, size).rotateX(-Math.PI / 2), new MeshStandardMaterial({ map: tex, color: water.colour, roughness: 0.22, metalness: 0.1 }));
  mesh.position.set((Math.max(...xs) + Math.min(...xs)) / 2, water.level, (Math.max(...zs) + Math.min(...zs)) / 2);
  mesh.receiveShadow = true;
  return { mesh, scroll: (dt: number) => { tex.offset.x += dt * 0.0045; tex.offset.y += dt * 0.0028; } };
}

// ---- The deck ----

/** Concrete parapet: a sloped face towards the road, a flat top, and a drop to below the deck. [across, up] from the road edge. */
const PARAPET: [number, number][] = [[0.3, 0], [0.38, 0.35], [0.5, 0.95], [0.75, 0.95], [0.75, -1.4]];
const PARAPET_INNER = PARAPET.map(([a, u]) => [-a, u] as [number, number]);
const UNDERSIDE = -1.4;
/** The other carriageway: its road runs from this far to that far on the left of ours. */
const GAP = 3, OTHER_WIDTH = 15;

/** Samples of the lap that are on a ramp or deck, widened a little so the ends of a stretch are covered. */
export function raisedMask(track: Track): boolean[] {
  const n = track.points.length, base = track.points.map(p => p.pos.y > RAISED);
  return base.map((_, i) => [-2, -1, 0, 1, 2].some(k => base[(i + k + n) % n]));
}

/**
 * Where the other carriageway runs beside the span: up on the deck, gentle bends only (it is 25 m out
 * on the left, so a tight left bend would fold it over itself), and nothing else of the lap nearby.
 */
function oncomingMask(track: Track, hw: number): boolean[] {
  const n = track.points.length, far = hw + GAP + OTHER_WIDTH + 18;
  const ok = track.points.map(p => p.pos.y > 12);
  const gentle = track.points.map((_, i) => { for (let k = -10; k <= 10; k++) if (Math.abs(track.points[(i + k + n) % n].curvature) > 1 / 36) return false; return true; });
  const clear = track.points.map(p => {
    const sx = p.pos.x - p.right.x * (hw + GAP + OTHER_WIDTH / 2), sz = p.pos.z - p.right.z * (hw + GAP + OTHER_WIDTH / 2);
    for (let j = 0; j < n; j += 3) {
      const d = Math.abs(track.points[j].s - p.s), along = Math.min(d, track.length - d);
      if (along > 70 && Math.hypot(track.points[j].pos.x - sx, track.points[j].pos.z - sz) < far - 6) return false;
    }
    return true;
  });
  const m = ok.map((v, i) => v && gentle[i] && clear[i]);
  // Drop short fragments: a stretch of deck is only worth building if it is long.
  const out = m.slice();
  for (let i = 0; i < n; i++) if (m[i]) {
    let a = i, b = i;
    while (m[(a - 1 + n) % n] && b - a < n) a = (a - 1 + n) % n;
    while (m[(b + 1) % n] && b - a < n) b = (b + 1) % n;
    if (((b - a + n) % n) * track.spacing < 90) out[i] = false;
  }
  return out;
}

/** The concrete under and around the raised road, plus the other carriageway. Not merged: these are long ribbons. */
export function deckMeshes(track: Track, hw: number, textures: { road: Texture; concrete: Texture }) {
  const mat = (map: Texture, roughness = 0.9) => new MeshStandardMaterial({ map, roughness, side: DoubleSide });
  const concrete = mat(textures.concrete), road = mat(textures.road, 0.85);
  const raised = raisedMask(track), other = oncomingMask(track, hw);
  const L0 = hw + GAP, L1 = L0 + OTHER_WIDTH;
  const g = new Group();
  const add = (geo: BufferGeometry, m: Material) => { const o = new Mesh(geo, m); o.receiveShadow = true; o.castShadow = true; g.add(o); };
  add(sweep(track, hw, -1, PARAPET, 3, raised), concrete);
  add(sweep(track, hw, 1, PARAPET, 3, raised), concrete);
  add(ribbon(track, -(hw + 0.75), hw + 0.75, UNDERSIDE, 14, raised), concrete);
  if (other.some(Boolean)) {
    add(ribbon(track, -L1, -L0, 0.02, 14, other), road);
    add(ribbon(track, -(L1 + 0.75), -(L0 - 0.75), UNDERSIDE, 14, other), concrete);
    add(sweep(track, L0, -1, PARAPET_INNER, 3, other), concrete);
    add(sweep(track, L1, -1, PARAPET, 3, other), concrete);
  }
  return { group: g, oncoming: other };
}

// ---- Props ----

const WOOD = ['#8a6b4a', '#a98467', '#7a5c3f', '#6b8fa3', '#b08968', '#9c7a52'];
const CANOE = ['#2f6fb5', '#d84315', '#f4b400', '#2e7d32', '#8d6e63', '#7b1fa2'];
const CAR = ['#c62828', '#1565c0', '#eeeeee', '#2e7d32', '#212121', '#f9a825', '#6a1b9a', '#90a4ae'];

/** Piers, lamps, signs, the traffic jam, canoes, buoys and stilt houses. Merged per cell like the street scenery. */
export function buildLagoon(cfg: TrackConfig, track: Track, density: number, land: Land, oncoming: boolean[]): Group {
  const water = cfg.setting!.water!, level = water.level, hw = cfg.halfWidth;
  const root = new Group(), r = rng(31), n = track.points.length;
  const mats = new Map<string, Material>();
  const m: MatFn = (c, o = {}) => {
    const k = c + JSON.stringify(o);
    if (!mats.has(k)) {
      const mt = new MeshStandardMaterial({ color: c, roughness: o.roughness ?? 0.75, metalness: o.metalness ?? 0, emissive: o.emissive ?? '#000', side: o.side });
      if (o.shadow) mt.userData.castShadow = true;
      mats.set(k, mt);
    }
    return mats.get(k)!;
  };
  const box = (w: number, h: number, d: number, mat: Material, x = 0, y = 0, z = 0) => { const o = new Mesh(new BoxGeometry(w, h, d), mat); o.position.set(x, y, z); return o; };
  const cyl = (rt: number, rb: number, h: number, mat: Material, seg = 8) => new Mesh(new CylinderGeometry(rt, rb, h, seg), mat);
  const at = (s: number, lateral = 0) => {
    const a = sampleAt(track, s);
    return { x: a.pos.x + a.right.x * lateral, y: a.pos.y, z: a.pos.z + a.right.z * lateral, yaw: Math.atan2(a.tangent.x, a.tangent.z), index: a.index };
  };
  /** Distance from (x, z) to the nearest part of the lap that is not within 80 m of s along the road. */
  const farFromOtherRoad = (x: number, z: number, s: number, min: number) => {
    for (let j = 0; j < n; j += 2) {
      const d = Math.abs(track.points[j].s - s), along = Math.min(d, track.length - d);
      if (along > 80 && Math.hypot(track.points[j].pos.x - x, track.points[j].pos.z - z) < min) return false;
    }
    return true;
  };

  // Piers every 32 m under the raised road: a cap beam and a column under each deck, down to the lagoon floor or the ground.
  const concrete = m('#b9b4aa', { roughness: 0.9, shadow: true });
  for (let s = 8; s < track.length; s += 32) {
    const p = at(s);
    if (p.y < 2.2) continue;
    const both = oncoming[p.index], L0 = hw + GAP, L1 = L0 + OTHER_WIDTH;
    // Group frame: local z runs along the road and local x to its left, so lateral L (to the right) sits at x = -L.
    const left = both ? L1 + 0.9 : hw + 0.9, right = hw + 0.9;
    const g = new Group();
    g.add(box(left + right, 1.1, 2.8, concrete, (left - right) / 2, -1.95, 0));
    const columns = both ? [hw - 3.5, -(L0 + 3), -(L1 - 3)] : [hw - 3.5, -(hw - 3.5)];
    for (const lat of columns) {
      const c = at(s, lat);
      if (!farFromOtherRoad(c.x, c.z, s, 11)) continue;
      const bottom = land.height(c.x, c.z), top = p.y - 2.5;
      const col = cyl(1.05, 1.25, top - bottom, concrete, 10);
      col.position.set(-lat, (top + bottom) / 2 - p.y, 0);
      g.add(col);
    }
    g.position.set(p.x, p.y, p.z); g.rotation.y = p.yaw;
    root.add(g);
  }

  // Lamps on the parapets, alternate sides, arching over the road.
  const lampPole = m('#6b6f73', { metalness: 0.6, roughness: 0.4 }), lampHead = m('#fff8d6', { emissive: '#fff1b0' });
  let side = 1;
  for (let s = 14; s < track.length; s += 42 / Math.max(0.5, density)) {
    const sd = side, p = at(s, sd * (hw + 0.55));
    if (p.y < 2.2) continue;
    side = -side;
    const g = new Group();
    const pole = cyl(0.1, 0.14, 8, lampPole, 6); pole.position.y = 4.95; g.add(pole);
    // The arm reaches over the road: local +x is the road's left, so a pole on the right (sd = 1) arms towards +x.
    g.add(box(2.6, 0.1, 0.1, lampPole, sd * 1.3, 8.9, 0));
    g.add(box(0.7, 0.16, 0.4, lampHead, sd * 2.5, 8.8, 0));
    g.position.set(p.x, p.y, p.z); g.rotation.y = p.yaw;
    root.add(g);
  }

  // Overhead signs over the road: on the ramp up and on the span.
  for (const [s, text] of [[500, '3RD MAINLAND BRIDGE'], [1180, 'LAGOS ISLAND'], [1560, 'OBALENDE  ·  ONIKAN']] as [number, string][]) {
    const p = at(s), g = directionSign(m, text, 2 * (hw + 1.2));
    g.position.set(p.x, p.y, p.z); g.rotation.y = p.yaw;
    root.add(g);
  }

  // The other carriageway at a standstill: a jam of danfos, kekes and saloons, nose to us.
  const jam = oncoming.some(Boolean);
  if (jam) {
    const car = (lat: number, s: number) => {
      const p = at(s, -lat), g = new Group();
      const kind = r();
      if (kind < 0.3) { const d = parkedDanfo(m, r); g.add(d); }
      else {
        const body = m(CAR[Math.floor(r() * CAR.length)], { roughness: 0.4, metalness: 0.2 });
        g.add(box(4.2, 0.85, 1.8, body, 0, 0.75, 0));
        g.add(box(2.3, 0.7, 1.6, m('#2b3a42', { roughness: 0.2 }), -0.2, 1.5, 0));
        [[1.3, 0.85], [1.3, -0.85], [-1.3, 0.85], [-1.3, -0.85]].forEach(([x, z]) => { const w = cyl(0.36, 0.36, 0.25, m('#161616'), 8); w.rotation.x = Math.PI / 2; w.position.set(x, 0.36, z); g.add(w); });
      }
      // Vehicles are built nose along +x. This yaw points the nose back at us, as oncoming traffic does.
      g.position.set(p.x, p.y + 0.02, p.z); g.rotation.y = p.yaw + Math.PI / 2;
      root.add(g);
    };
    const lanes = [GAP + hw + OTHER_WIDTH * 0.2, GAP + hw + OTHER_WIDTH * 0.5, GAP + hw + OTHER_WIDTH * 0.8];
    for (let s = 6; s < track.length - 6; s += 6.5 / Math.max(0.4, density)) {
      if (!oncoming[at(s).index]) continue;
      lanes.forEach(lat => { if (r() < 0.7) car(lat + (r() - 0.5) * 0.6, s + (r() - 0.5) * 2.5); });
    }
  }

  // Open water: canoes with paddlers, buoys and the odd fishing boat.
  const roadPts = track.points.filter((_, i) => i % 3 === 0);
  const waterSpot = (min: number, max: number) => {
    for (let tries = 0; tries < 12; tries++) {
      const p = track.points[Math.floor(r() * n)], lat = (r() < 0.5 ? -1 : 1) * (min + r() * (max - min));
      const x = p.pos.x + p.right.x * lat, z = p.pos.z + p.right.z * lat;
      if (land.height(x, z) > level - 1.2) continue;
      if (roadPts.some(q => Math.hypot(q.pos.x - x, q.pos.z - z) < min - 4)) continue;
      return { x, z };
    }
    return null;
  };
  const skin = ['#5d4037', '#6d4c41', '#8d5524', '#4e342e'];
  const nCanoes = Math.round(70 * density);
  for (let i = 0; i < nCanoes; i++) {
    const w = waterSpot(26, 150); if (!w) continue;
    const g = new Group();
    const hull = new Mesh(new SphereGeometry(1, 8, 5), m(CANOE[Math.floor(r() * CANOE.length)], { roughness: 0.5 })); hull.scale.set(2.6, 0.3, 0.5); hull.position.y = 0.05; g.add(hull);
    g.add(box(5.1, 0.07, 0.5, m('#5d4037'), 0, 0.2, 0));
    const body = cyl(0.16, 0.2, 0.75, m(['#ffffff', '#f9a825', '#1565c0', '#c62828'][Math.floor(r() * 4)]), 6); body.position.set(-0.6, 0.62, 0); g.add(body);
    const head = new Mesh(new SphereGeometry(0.16, 7, 5), m(skin[Math.floor(r() * skin.length)])); head.position.set(-0.6, 1.1, 0); g.add(head);
    const paddle = box(2.0, 0.04, 0.08, m('#6d4c41'), -0.2, 0.5, 0.45); paddle.rotation.z = 0.5; g.add(paddle);
    g.position.set(w.x, level + 0.02, w.z); g.rotation.y = r() * 6.28;
    root.add(g);
  }
  for (let i = 0; i < Math.round(30 * density); i++) {
    const w = waterSpot(24, 130); if (!w) continue;
    const b = new Mesh(new SphereGeometry(0.34, 8, 6), m(i % 2 ? '#d32f2f' : '#f5f5f5', { roughness: 0.4 }));
    b.position.set(w.x, level + 0.08, w.z); root.add(b);
  }
  for (let i = 0; i < Math.round(8 * density); i++) {
    const w = waterSpot(60, 220); if (!w) continue;
    const g = new Group();
    g.add(box(8.5, 1.2, 2.4, m(CANOE[Math.floor(r() * CANOE.length)], { roughness: 0.5, shadow: true }), 0, 0.3, 0));
    g.add(box(2.4, 1.6, 2.0, m('#eeeeee', { shadow: true }), -1.8, 1.7, 0));
    g.add(box(2.5, 0.12, 2.1, m('#c62828'), -1.8, 2.55, 0));
    g.add(cyl(0.06, 0.06, 4, m('#6d4c41'), 5)); g.children[g.children.length - 1].position.set(2.2, 2.4, 0);
    g.position.set(w.x, level + 0.1, w.z); g.rotation.y = r() * 6.28;
    root.add(g);
  }

  // Makoko: stilt houses either side of the causeway, up to the edge of the bank.
  const zinc = m('#8c8f91', { roughness: 0.6, metalness: 0.4, shadow: true }), rust = m('#8d5a3b', { roughness: 0.8, shadow: true });
  const posts = m('#4e342e', { roughness: 0.9 });
  const causeway = (i: number) => { const p = track.points[i]; return p.pos.y < RAISED && !land.isLand(p.pos.x, p.pos.z); };
  const house = (x: number, z: number, yaw: number) => {
    const g = new Group(), wall = m(WOOD[Math.floor(r() * WOOD.length)], { roughness: 0.9, shadow: true });
    const floor = level + 1.5, w = 3.2 + r() * 2.2, d = 2.8 + r() * 1.6;
    for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const post = cyl(0.12, 0.14, floor - (level - 1.4), posts, 5);
      post.position.set(px * (w / 2 - 0.15), (floor + level - 1.4) / 2, pz * (d / 2 - 0.15));
      g.add(post);
    }
    g.add(box(w + 0.5, 0.16, d + 0.5, m('#6d4c41', { roughness: 0.9 }), 0, floor, 0));
    g.add(box(w, 2.1, d, wall, 0, floor + 1.1, 0));
    g.add(box(0.8, 1.5, 0.06, m('#3e2723'), -w * 0.2, floor + 0.85, d / 2 + 0.03));
    // Gabled zinc roof, rusty in places.
    const roofMat = r() < 0.4 ? rust : zinc;
    for (const sgn of [-1, 1]) { const rf = box(w + 0.6, 0.08, d / 2 + 0.55, roofMat, 0, floor + 2.55, sgn * (d / 4 + 0.05)); rf.rotation.x = -sgn * 0.38; g.add(rf); }
    if (r() < 0.5) g.add(box(0.5, 0.5, 0.5, m(['#f9a825', '#c62828', '#1565c0'][Math.floor(r() * 3)]), w / 2 - 0.6, floor + 0.35, d / 2 + 0.5));
    g.position.set(x, 0, z); g.rotation.y = yaw;
    root.add(g);
  };
  for (let i = 0; i < n; i += Math.max(4, Math.round(7 / density))) {
    if (!causeway(i)) continue;
    const p = track.points[i];
    for (const sd of [-1, 1]) {
      if (r() < 0.25) continue;
      const lat = sd * (hw + 10 + r() * 50), x = p.pos.x + p.right.x * lat, z = p.pos.z + p.right.z * lat;
      if (land.height(x, z) > level - 0.8 || roadPts.some(q => Math.hypot(q.pos.x - x, q.pos.z - z) < hw + 9)) continue;
      house(x, z, Math.atan2(p.tangent.x, p.tangent.z) + (r() - 0.5) * 0.6);
    }
  }
  return chunkAndMerge(root);
}
