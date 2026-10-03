import {
  BufferAttribute, BufferGeometry, CanvasTexture, Color, RepeatWrapping, SRGBColorSpace, type Texture,
} from 'three';
import type { Track } from '../game/track';

/** Canvas texture helper (sRGB, optional repeat). */
export function canvasTex(w: number, h: number, draw: (x: CanvasRenderingContext2D, w: number, h: number) => void, repeat = false): Texture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = RepeatWrapping; }
  return t;
}

/** Seeded random so the scenery is the same every race. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/**
 * Sweep a 2D profile along the track at a lateral offset. Profile points are [across, up] in
 * metres, with `across` measured outwards from `offset` (side = 1 right, -1 left). U runs along the
 * profile (0..1), V along the track in units of `vLength` metres.
 */
export function sweep(track: Track, offset: number, side: 1 | -1, profile: [number, number][], vLength: number): BufferGeometry {
  const pts = track.points, n = pts.length, m = profile.length;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let pLen = 0;
  const cum = profile.map((p, i) => (i ? (pLen += Math.hypot(p[0] - profile[i - 1][0], p[1] - profile[i - 1][1])) : 0));
  for (let i = 0; i <= n; i++) {
    const p = pts[i % n], s = i === n ? track.length : p.s;
    for (let j = 0; j < m; j++) {
      const o = (offset + profile[j][0]) * side;
      pos.push(p.pos.x + p.right.x * o, p.pos.y + profile[j][1], p.pos.z + p.right.z * o);
      uv.push(pLen ? cum[j] / pLen : j / (m - 1), s / vLength);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < m - 1; j++) {
    const a = i * m + j, b = a + 1, c = a + m, d = c + 1;
    // Profiles run inner-bottom, over the top, to outer-bottom; wind so faces point out of the solid.
    if (side > 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Flat ribbon between two signed lateral offsets (negative = left), at height y. */
export function ribbon(track: Track, from: number, to: number, y: number, vLength: number): BufferGeometry {
  const pts = track.points, n = pts.length;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const p = pts[i % n], s = i === n ? track.length : p.s;
    for (const [o, u] of [[from, 0], [to, 1]] as const) {
      pos.push(p.pos.x + p.right.x * o, p.pos.y + y, p.pos.z + p.right.z * o);
      uv.push(u, s / vLength);
    }
  }
  for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Make sure the ribbon faces up whichever way the offsets were given.
  if (g.attributes.normal.getY(0) < 0) { g.setIndex(idx.map((_, i, a) => a[i - (i % 3) + [0, 2, 1][i % 3]])); g.computeVertexNormals(); }
  return g;
}

/** Drivable surface (as trimesh data) between two lateral offsets, following the hills. */
export function surfaceCollider(track: Track, from: number, to: number) {
  const pts = track.points, n = pts.length;
  const v = new Float32Array(n * 2 * 3), idx: number[] = [];
  pts.forEach((p, i) => v.set([p.pos.x + p.right.x * from, p.pos.y, p.pos.z + p.right.z * from, p.pos.x + p.right.x * to, p.pos.y, p.pos.z + p.right.z * to], i * 6));
  for (let i = 0; i < n; i++) { const a = i * 2, b = ((i + 1) % n) * 2; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  return { vertices: v, indices: new Uint32Array(idx) };
}

/**
 * Ground around the track as a height grid that follows the road's hills (an inverse-distance
 * blend of nearby road heights, so neighbouring stretches at different heights meet smoothly).
 */
export function terrainGeometry(track: Track, halfWidth: number, margin = 320, cell = 8): BufferGeometry {
  const xs = track.points.map(p => p.pos.x), zs = track.points.map(p => p.pos.z);
  const x0 = Math.min(...xs) - margin, z0 = Math.min(...zs) - margin, x1 = Math.max(...xs) + margin, z1 = Math.max(...zs) + margin;
  const nx = Math.ceil((x1 - x0) / cell), nz = Math.ceil((z1 - z0) / cell);
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3), uv = new Float32Array((nx + 1) * (nz + 1) * 2), idx: number[] = [];
  const pts = track.points.filter((_, i) => i % 3 === 0);
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = x0 + i * cell, z = z0 + j * cell;
    let wsum = 0, ysum = 0, near = Infinity, nearY = 0;
    for (const p of pts) {
      const d2 = (p.pos.x - x) ** 2 + (p.pos.z - z) ** 2, w = 1 / (d2 * d2 + 400);
      wsum += w; ysum += w * p.pos.y;
      if (d2 < near) { near = d2; nearY = p.pos.y; }
    }
    // Close to the road the ground sits just under it (never poking through on the hills);
    // further out it blends smoothly between neighbouring stretches.
    const blend = Math.min(1, Math.max(0, (Math.sqrt(near) - (halfWidth + 6)) / 20));
    const k = j * (nx + 1) + i;
    pos.set([x, (nearY - 0.4) * (1 - blend) + (ysum / wsum - 0.4) * blend, z], k * 3);
    uv.set([x / 23, z / 23], k * 2);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c2 = a + nx + 1, d = c2 + 1;
    idx.push(a, c2, b, b, c2, d);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("uv", new BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Plain weathered concrete kerb. */
export function kerbConcreteTexture() {
  return canvasTex(64, 128, (x, w, h) => {
    x.fillStyle = "#b9b3a8"; x.fillRect(0, 0, w, h);
    const r = rng(12);
    for (let i = 0; i < 160; i++) { x.fillStyle = `rgba(70,60,50,${r() * 0.18})`; x.fillRect(r() * w, r() * h, 2 + r() * 3, 2 + r() * 3); }
    x.fillStyle = "rgba(40,35,30,.35)"; x.fillRect(0, 0, w, 2);
    x.fillStyle = "rgba(60,50,40,.25)"; x.fillRect(0, h * 0.6, w, h * 0.4);
  }, true);
}

/**
 * Solid collision wall along the track: a chain of boxes whose inner faces sit on the signed
 * lateral offset. Boxes have volume, so a vehicle hitting head-on at full speed is pushed back
 * out instead of tunnelling through (a thin mesh wall can be punched through).
 */
export function wallBoxes(track: Track, offset: number, thickness = 1.2, height = 3.5, every = 2) {
  const pts = track.points, n = pts.length, side = Math.sign(offset), out: { pos: [number, number, number]; rotY: number; half: [number, number, number] }[] = [];
  const mid = offset + side * thickness / 2;
  for (let i = 0; i < n; i += every) {
    const a = pts[i], b = pts[(i + every) % n];
    const ax = a.pos.x + a.right.x * mid, az = a.pos.z + a.right.z * mid;
    const bx = b.pos.x + b.right.x * mid, bz = b.pos.z + b.right.z * mid;
    const len = Math.hypot(bx - ax, bz - az);
    out.push({
      pos: [(ax + bx) / 2, (a.pos.y + b.pos.y) / 2 + height / 2 - 1, (az + bz) / 2],
      rotY: Math.atan2(-(bz - az), bx - ax),
      half: [len / 2 + 0.35, height / 2, thickness / 2],
    });
  }
  return out;
}

/** Vertical collision wall (as trimesh data) along the track at a signed lateral offset. */
export function wallCollider(track: Track, offset: number, bottom = -1, top = 2.5) {
  const pts = track.points, n = pts.length;
  const v = new Float32Array(n * 2 * 3), idx: number[] = [];
  pts.forEach((p, i) => {
    const x = p.pos.x + p.right.x * offset, z = p.pos.z + p.right.z * offset;
    v.set([x, p.pos.y + bottom, z, x, p.pos.y + top, z], i * 6);
  });
  for (let i = 0; i < n; i++) {
    const a = i * 2, b = ((i + 1) % n) * 2;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return { vertices: v, indices: new Uint32Array(idx) };
}

export function asphaltTexture() {
  return canvasTex(256, 512, (x, w, h) => {
    x.fillStyle = '#56524e'; x.fillRect(0, 0, w, h);
    const r = rng(7);
    for (let i = 0; i < 2600; i++) {
      const k = 60 + r() * 60 | 0;
      x.fillStyle = `rgba(${k},${k - 3},${k - 6},${0.35 + r() * 0.4})`;
      x.fillRect(r() * w, r() * h, 1 + r() * 2.5, 1 + r() * 2.5);
    }
    // Patches of repair and oil stains: it's Lagos.
    for (let i = 0; i < 6; i++) {
      x.fillStyle = `rgba(30,28,26,${0.15 + r() * 0.15})`;
      x.beginPath(); x.ellipse(w * (0.2 + r() * 0.6), r() * h, 8 + r() * 22, 12 + r() * 30, r() * 3, 0, 7); x.fill();
    }
    x.fillStyle = '#f1efe6';
    x.fillRect(w * 0.035, 0, w * 0.022, h); x.fillRect(w * 0.943, 0, w * 0.022, h);
    x.fillStyle = '#f2c200';
    x.fillRect(w * 0.49, 0, w * 0.02, h * 0.42);
  }, true);
}

export function kerbTexture() {
  return canvasTex(64, 128, (x, w, h) => {
    x.fillStyle = '#f2c200'; x.fillRect(0, 0, w, h / 2);
    x.fillStyle = '#1d1d1d'; x.fillRect(0, h / 2, w, h / 2);
    x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(0, 0, w * 0.25, h);
  }, true);
}

export function barrierTexture() {
  return canvasTex(64, 256, (x, w, h) => {
    x.fillStyle = '#e9e4d8'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#d4141c'; x.fillRect(0, 0, w, h * 0.5);
    x.fillStyle = 'rgba(0,0,0,.12)'; x.fillRect(0, h * 0.49, w, h * 0.02); x.fillRect(0, 0, w, h * 0.01);
    x.fillStyle = 'rgba(80,60,40,.25)'; x.fillRect(0, h * 0.8, w, h * 0.2);
  }, true);
}

export function groundTexture(color: string) {
  const c = new Color(color);
  return canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = color; x.fillRect(0, 0, w, h);
    const r = rng(3);
    for (let i = 0; i < 1800; i++) {
      const d = (r() - 0.5) * 0.18;
      x.fillStyle = `rgb(${Math.min(255, (c.r + d) * 255) | 0},${Math.min(255, (c.g + d * 0.8) * 255) | 0},${Math.min(255, (c.b + d * 0.6) * 255) | 0})`;
      x.fillRect(r() * w, r() * h, 2 + r() * 4, 2 + r() * 4);
    }
    // Patches of weeds and grass, darker wet dirt, tyre ruts and litter, so open ground isn't flat.
    for (let i = 0; i < 9; i++) {
      const px = r() * w, py = r() * h, rad = 14 + r() * 26;
      for (let k = 0; k < 40; k++) {
        const a = r() * 6.28, d = r() * rad;
        x.fillStyle = `rgba(${70 + r() * 40},${110 + r() * 40},${40 + r() * 20},${0.35 + r() * 0.4})`;
        x.fillRect(px + Math.cos(a) * d, py + Math.sin(a) * d, 2 + r() * 3, 3 + r() * 5);
      }
    }
    for (let i = 0; i < 6; i++) { x.fillStyle = `rgba(70,45,30,${0.12 + r() * 0.12})`; x.beginPath(); x.ellipse(r() * w, r() * h, 16 + r() * 30, 8 + r() * 18, r() * 3, 0, 7); x.fill(); }
    x.strokeStyle = 'rgba(80,55,40,.18)'; x.lineWidth = 3;
    for (let i = 0; i < 3; i++) { const y0 = r() * h; x.beginPath(); x.moveTo(0, y0); x.bezierCurveTo(w * 0.3, y0 + 30, w * 0.6, y0 - 30, w, y0 + 10); x.stroke(); x.beginPath(); x.moveTo(0, y0 + 9); x.bezierCurveTo(w * 0.3, y0 + 39, w * 0.6, y0 - 21, w, y0 + 19); x.stroke(); }
    for (let i = 0; i < 30; i++) { x.fillStyle = ['#e0e0e0', '#1565c0', '#2e7d32', '#fafafa'][Math.floor(r() * 4)]; x.globalAlpha = 0.5; x.fillRect(r() * w, r() * h, 2 + r() * 3, 1.5 + r() * 2); x.globalAlpha = 1; }
  }, true);
}

export function shoulderTexture() {
  return canvasTex(64, 64, (x, w, h) => {
    x.fillStyle = '#b9ab95'; x.fillRect(0, 0, w, h);
    const r = rng(5);
    for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(90,70,50,${r() * 0.3})`; x.fillRect(r() * w, r() * h, 2, 2); }
    x.fillStyle = 'rgba(0,0,0,.12)'; x.fillRect(0, 0, w, 2);
  }, true);
}
