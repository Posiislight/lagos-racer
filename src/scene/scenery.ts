import {
  BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DoubleSide, Group, Material,
  Mesh, MeshStandardMaterial, PlaneGeometry, SphereGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { SceneryZone, TrackConfig } from '../config/tracks';
import { axisPoint, roadSpan, roadToS } from '../game/outAndBack';
import { zoneSign } from './zoneSign';
import { flyerHoarding, hospitalBlocks, kioskRow, mosque, parkedKeke, redBlock, shopfront, solarLight, tankerTruck, terminalCanopy, yellowBlock } from './ikoroduLandmarks';
import { church, directionSign, parkedOkada, petrolStation, statueIsland, tejuoshoBlock } from './landmarks';
import { distanceToCentre, heightAt, sampleAt, type Track } from '../game/track';
import { mergeStatic } from '../models/optimize';
import { canvasTex, rng } from './trackGeometry';
import { FACADES, SIDE_STRIP, cellUV, facadeAtlas, type FacadeKind } from './art/facades';
import { makeCrowd, PEOPLE_COUNT } from './art/people';
import { clothesTexture, zincTexture } from './art/textures';

/** Concrete kerb width at the road edge, then a narrow pavement (with the gutter) to the shop fronts. */
export const KERB = 0.3;
export const PAVEMENT = 2.6;

const SHOP_SIGNS = [
  'MAMA PUT • HOT AMALA', "GOD'S GRACE PHARMACY", 'OJUELEGBA ELECTRONICS', 'POS HERE • 24HRS', 'BLESSED HANDS SALON',
  'JESUS IS LORD MOTOR PARTS', 'ALHAJI & SONS PROVISIONS', 'CHOP & QUENCH BUKKA', 'SHINE YOUR EYE OPTICIANS',
  'DIVINE FAVOUR TAILORING', 'VULCANIZER • GAS & TYRE', 'OKADA SPARE PARTS', 'MALLAM SUYA SPOT', 'FAITH PHONE REPAIRS',
  'NO FOOD FOR LAZY MAN CAFE', 'AJE BUTTER BOUTIQUE',
];
const SIGN_COLORS: [string, string][] = [
  ['#c62828', '#fff'], ['#1565c0', '#fff'], ['#2e7d32', '#fff'], ['#f9a825', '#1a1a1a'], ['#6a1b9a', '#fff'],
  ['#ffffff', '#c62828'], ['#00838f', '#fff'], ['#e65100', '#fff'],
];
const BILLBOARDS: { title: string; tag: string; bg: string; fg: string; accent: string }[] = [
  { title: 'JOLLOF TURBO', tag: 'Fuel for champions', bg: '#d84315', fg: '#fff', accent: '#ffd54f' },
  { title: 'ÈKÓ NITRO', tag: 'Go faster, o!', bg: '#1a237e', fg: '#fff', accent: '#00e5ff' },
  { title: 'SUYA SPEED', tag: 'Hot like Lagos', bg: '#3e2723', fg: '#ffcc80', accent: '#ff7043' },
  { title: 'NO SHAKING', tag: 'Insurance • We dey for you', bg: '#1b5e20', fg: '#fff', accent: '#c6ff00' },
  { title: 'OGA RACING', tag: 'Is it a crime to win?', bg: '#111', fg: '#f5b400', accent: '#d0141a' },
  { title: 'LASTMA DEY WATCH', tag: 'Drive well o', bg: '#f5b400', fg: '#1a1a1a', accent: '#2e7d32' },
  { title: 'AGBERO MOTORSPORT', tag: 'Park well!', bg: '#6a1b9a', fg: '#fff', accent: '#ffeb3b' },
  { title: 'KABIYESI', tag: 'Royal chin-chin', bg: '#b71c1c', fg: '#ffd700', accent: '#fff' },
];
// Where each facade's sign band sits (fraction of building height from the ground).
const SIGN_Y: Record<FacadeKind, number> = { concrete: 0.26, house: 0.47, plaza: 0.32, shops: 0.68 };
const PAINT = ['#f2d0a4', '#a8d5e2', '#f7a9a8', '#c5e1a5', '#fff59d', '#ffffff', '#ffcc80', '#b39ddb', '#e0e0e0', '#80cbc4', '#ffffff', '#ffffff'];

/** One shared texture for many labels: each label gets a cell, addressed by UV. */
class Atlas {
  readonly cols: number; readonly rows: number; readonly cw: number; readonly ch: number;
  private items: ((x: CanvasRenderingContext2D, w: number, h: number) => void)[] = [];
  material: MeshStandardMaterial | null = null;
  constructor(cols: number, rows: number, cw: number, ch: number) { this.cols = cols; this.rows = rows; this.cw = cw; this.ch = ch; }
  add(draw: (x: CanvasRenderingContext2D, w: number, h: number) => void) { this.items.push(draw); return this.items.length - 1; }
  build(emissive = 0) {
    const tex = canvasTex(this.cols * this.cw, this.rows * this.ch, x => {
      this.items.forEach((d, i) => {
        x.save(); x.translate((i % this.cols) * this.cw, Math.floor(i / this.cols) * this.ch);
        x.beginPath(); x.rect(0, 0, this.cw, this.ch); x.clip(); d(x, this.cw, this.ch); x.restore();
      });
    });
    this.material = new MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: new Color(emissive, emissive, emissive), emissiveMap: emissive ? tex : null });
    return this.material;
  }
  /** A plane (w x h) showing item i. */
  plane(i: number, w: number, h: number) {
    const g = new PlaneGeometry(w, h), uv = g.attributes.uv as BufferAttribute;
    const u0 = (i % this.cols) / this.cols, v0 = 1 - (Math.floor(i / this.cols) + 1) / this.rows;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) / this.cols, v0 + uv.getY(k) / this.rows);
    return new Mesh(g, this.material!);
  }
}

type Spot = { x: number; y: number; z: number; yaw: number; s: number; side: number };
export type MatFn = (c: string, o?: Partial<{ roughness: number; metalness: number; emissive: string; side: typeof DoubleSide; shadow: boolean }>) => Material;

/** `median`: per track sample, whether the left side is the median (see medianMask), or null. */
export function buildScenery(cfg: TrackConfig, track: Track, density: number, median: boolean[] | null = null): Group {
  const root = new Group();
  const r = rng(42);
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
  const hw = cfg.halfWidth;
  /** Shop fronts start right behind the pavement. */
  const FRONT = hw + PAVEMENT + 0.6;
  // Keep scenery off every stretch of road (other parts of the loop pass close by too).
  const clearOf = (x: number, z: number, radius: number) => distanceToCentre(track, x, z) > FRONT - 0.3 + radius;
  // Along a real road, zones and bridges are given by distance along its axis; find them on the lap.
  const gap = 2 * hw + (cfg.median?.width ?? 0);
  const onLap = (d: number, street: 'north' | 'south') => roadToS(track, cfg.axis!, d, street, gap);
  const zoneRange = (z: SceneryZone): { s0: number; s1: number; sides: number[] } => {
    if (!('road' in z)) return { s0: z.from * track.length, s1: z.to * track.length, sides: z.side === 0 ? [-1, 1] : [z.side] };
    // Shops face the road on the right of each leg; the left is the median.
    const [s0, s1] = roadSpan(track, cfg.axis!, z.road, z.street, gap);
    return { s0, s1, sides: [1] };
  };
  // A bridge over an out-and-back road crosses both legs.
  const bridgeAt = cfg.bridges.map(b => b.road === undefined
    ? { ...b, s: b.s ?? 0, also: [] as number[] }
    : { ...b, s: onLap(b.road, 'north'), also: [onLap(b.road, 'south')] });
  const nearBridge = (s: number) => bridgeAt.some(b => [b.s, ...b.also].some(bs => Math.abs(wrap(s - bs, track.length)) < (b.width ?? 13) / 2 + 2.5));
  const zinc = new MeshStandardMaterial({ map: zincTexture(), roughness: 0.7, metalness: 0.3 });
  zinc.userData.castShadow = true;
  const clothes = new MeshStandardMaterial({ map: clothesTexture(), alphaTest: 0.5, side: DoubleSide, roughness: 0.9 });
  const crowd: { x: number; y: number; z: number; h: number; cell: number; flip: boolean }[] = [];
  const person = (x: number, y: number, z: number, cell = Math.floor(r() * PEOPLE_COUNT)) => crowd.push({ x, y, z, h: 1.75 + r() * 0.3, cell, flip: r() < 0.5 });

  // Labels: shop signs and billboards share atlases so they merge into a couple of draw calls.
  const signs = new Atlas(2, 8, 512, 72);
  SHOP_SIGNS.forEach((t, i) => signs.add((x, w, h) => {
    const [bg, fg] = SIGN_COLORS[i % SIGN_COLORS.length];
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    x.strokeStyle = fg; x.lineWidth = 4; x.strokeRect(6, 6, w - 12, h - 12);
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    let fs = 40; do { x.font = `900 ${fs}px Archivo, Arial`; fs -= 2; } while (x.measureText(t).width > w - 40 && fs > 12);
    x.fillText(t, w / 2, h / 2 + 2);
    // Sun-bleached and dusty, like real signboards.
    x.fillStyle = 'rgba(120,100,70,.12)'; x.fillRect(0, h * 0.6, w, h * 0.4);
  }));
  signs.build(0.15);
  const boards = new Atlas(2, 4, 512, 256);
  BILLBOARDS.forEach(b => boards.add((x, w, h) => {
    x.fillStyle = b.bg; x.fillRect(0, 0, w, h);
    x.fillStyle = b.accent; x.beginPath(); x.moveTo(w * 0.62, 0); x.lineTo(w, 0); x.lineTo(w, h); x.lineTo(w * 0.5, h); x.fill();
    x.fillStyle = 'rgba(255,255,255,.12)'; for (let i = 0; i < 6; i++) x.fillRect(0, h * 0.78 + i * 6, w, 2);
    x.textAlign = 'left'; x.textBaseline = 'alphabetic'; x.fillStyle = b.fg;
    let fs = 82; do { x.font = `italic 900 ${fs}px Archivo, Arial`; fs -= 2; } while (x.measureText(b.title).width > w * 0.86 && fs > 20);
    x.fillText(b.title, 26, h * 0.5);
    x.font = '700 30px Archivo, Arial'; x.fillText(b.tag, 28, h * 0.72);
  }));
  boards.build(0.12);

  const spot = (s: number, side: number, offset: number): Spot => {
    const at = sampleAt(track, s);
    const x = at.pos.x + at.right.x * offset * side, z = at.pos.z + at.right.z * offset * side;
    // Face the road: local +z points back towards the centre line.
    const fx = -at.right.x * side, fz = -at.right.z * side;
    return { x, y: at.pos.y, z, yaw: Math.atan2(fx, fz), s, side };
  };
  const place = (o: Mesh | Group, sp: Spot, lift = 0) => { o.position.set(sp.x, sp.y + lift, sp.z); o.rotation.y = sp.yaw; root.add(o); return o; };
  /** World position of a point in a spot's local frame (x along the front, z towards the road). */
  const local = (sp: Spot, lx: number, lz: number) => ({ x: sp.x + Math.cos(sp.yaw) * lx + Math.sin(sp.yaw) * lz, y: sp.y, z: sp.z - Math.sin(sp.yaw) * lx + Math.cos(sp.yaw) * lz });
  const PAVE_Y = 0.18;

  // ---- Buildings: painted fronts from the facade atlas, merged per cell, tinted per building ----
  const bGeos = new Map<string, BufferGeometry[]>();
  const addBox = (sp: Spot, kind: FacadeKind, w: number, h: number, d: number, tint: string) => {
    const g = new BoxGeometry(w, h, d);
    const uv = g.attributes.uv as BufferAttribute, nrm = g.attributes.normal as BufferAttribute;
    const [u0, v0, u1, v1] = cellUV(FACADES[kind].cell), su1 = u0 + (u1 - u0) * SIDE_STRIP;
    const c = new Color('#ffffff').lerp(new Color(tint), 0.5), cols = new Float32Array(uv.count * 3);
    for (let i = 0; i < uv.count; i++) {
      const nz = nrm.getZ(i), ny = nrm.getY(i), ux = uv.getX(i), vy = uv.getY(i);
      if (nz > 0.5) uv.setXY(i, u0 + ux * (u1 - u0), v0 + vy * (v1 - v0));
      else if (Math.abs(ny) > 0.5) uv.setXY(i, u0 + 0.005, v1 - 0.005);
      // Sides and backs get the painted front too (real buildings have windows all round),
      // except for a plain strip at the very edge so corners don't look sliced.
      else uv.setXY(i, su1 + ux * (u1 - su1), v0 + vy * (v1 - v0));
      const shade = ny > 0.5 ? 0.7 : nz > 0.5 ? 1 : 0.88;
      cols.set([c.r * shade, c.g * shade, c.b * shade], i * 3);
    }
    g.setAttribute('color', new BufferAttribute(cols, 3));
    // Sink the base a little so buildings sit into slopes instead of floating.
    g.translate(0, h / 2 - 0.6, 0); g.rotateY(sp.yaw); g.translate(sp.x, sp.y + PAVE_Y, sp.z);
    const key = cellKey(sp.x, sp.z);
    if (!bGeos.has(key)) bGeos.set(key, []);
    bGeos.get(key)!.push(g.toNonIndexed());
  };

  let signIdx = 0;
  /** A building whose front face sits on the spot, with its 3D extras. Returns its height. */
  const building = (sp: Spot, kind: FacadeKind, scale: number, d: number, o: { sign?: boolean; rooftopAd?: boolean; tints?: string[] } = {}) => {
    const f = FACADES[kind], w = f.width * scale, h = f.height * scale + 0.6;
    // Shift the box back so its front face is on the spot.
    const c = local(sp, 0, -d / 2);
    const csp = { ...sp, x: c.x, z: c.z };
    const tints = o.tints ?? PAINT;
    addBox(csp, kind, w, h, d, tints[Math.floor(r() * tints.length)]);
    const g = new Group();
    const front = d / 2, top = h - 0.6;
    if (o.sign && kind !== 'shops') {
      const sg = signs.plane(signIdx++ % SHOP_SIGNS.length, Math.min(w * 0.75, 9), 1.05 * scale);
      sg.position.set((r() - 0.5) * w * 0.15, top * SIGN_Y[kind], front + 0.06); g.add(sg);
    }
    if (kind === 'concrete') {
      for (let k = 0; k < 3; k++) if (r() < 0.6) g.add(box(0.75, 0.5, 0.45, m('#e7e7e2', { roughness: 0.5 }), -w / 2 + (0.2 + r() * 0.6) * w, top * (0.42 + Math.floor(r() * 3) * 0.19), front + 0.22));
      if (r() < 0.5) { const dish = new Mesh(new SphereGeometry(0.55, 10, 6, 0, Math.PI * 2, 0, 1.1), m('#dcdcdc', { side: DoubleSide })); dish.position.set(w * 0.3, top + 0.5, 0); dish.rotation.x = 1.1; g.add(dish); }
    } else if (kind === 'house') {
      g.add(box(w * 0.98, 0.16, 1.0, m('#d8d2c6'), 0, top * 0.6, front + 0.5));
      const pitch = 0.42, half = d / 2 + 0.5, len = half / Math.cos(pitch);
      [-1, 1].forEach(s => {
        const p = new Mesh(new BoxGeometry(w + 0.8, 0.1, len), zinc);
        p.position.set(0, top + Math.tan(pitch) * half / 2, s * half / 2); p.rotation.x = s * pitch; g.add(p);
      });
      g.add(box(w + 0.6, 0.15, 0.3, m('#5b4636'), 0, top + Math.tan(pitch) * half, 0));
    } else if (kind === 'shops') {
      // Corrugated awning over the open shopfronts, reaching over the pavement.
      const aw = new Mesh(new BoxGeometry(w, 0.08, 2.0), zinc); aw.position.set(0, top * 0.7, front + 0.95); aw.rotation.x = 0.16; g.add(aw);
      [-0.45, 0, 0.45].forEach(k => { const p = cyl(0.05, 0.05, top * 0.68, m('#6d6d6d', { metalness: 0.4 }), 5); p.position.set(k * w, top * 0.34, front + 1.85); g.add(p); });
      const sg = signs.plane(signIdx++ % SHOP_SIGNS.length, Math.min(w * 0.7, 8), 0.9);
      sg.position.set(0, top * 0.7 + 0.55, front + 1.96); g.add(sg);
    } else if (kind === 'plaza') {
      g.add(box(w + 0.3, 0.5, d + 0.3, m('#c3ccd3'), 0, top + 0.25, 0));
    }
    // Rooftop billboard: the Lagos way of advertising.
    if (o.rooftopAd && kind !== 'house') {
      const rt = kind === 'plaza' ? top + 0.5 : top;
      [-2.8, 2.8].forEach(x => { const p = cyl(0.1, 0.1, 3, m('#555555', { metalness: 0.5 }), 5); p.position.set(x, rt + 1.5, 0); g.add(p); });
      g.add(box(8.6, 4.4, 0.25, m('#333333'), 0, rt + 4.6, -0.1));
      const face = boards.plane(Math.floor(r() * BILLBOARDS.length), 8.2, 4.1); face.position.set(0, rt + 4.6, 0.04); g.add(face);
    }
    // Black plastic water tanks on most roofs.
    if (kind !== 'shops' && !o.rooftopAd && r() < 0.75) {
      const ty = kind === 'house' ? top + 1.0 : top;
      for (let k = 0; k < (r() < 0.4 ? 2 : 1); k++) { const tk = cyl(0.8, 0.8, 1.5, m('#1b1b1b', { roughness: 0.45 }), 10); tk.position.set((r() - 0.5) * w * 0.6, ty + 0.75, (r() - 0.5) * d * 0.4); g.add(tk); }
    }
    g.position.set(c.x, sp.y + PAVE_Y, c.z); g.rotation.y = sp.yaw; root.add(g);
    return { w, h };
  };

  /** A parked car like the ones on Ojuelegba Road: SUVs, saloons, the odd red car. */
  const CAR_COLS = ['#5b5f66', '#c0c4c8', '#1b1b1b', '#f2f2f2', '#9b1c1c', '#2b4c7e', '#7a6a55'];
  const car = (x: number, y: number, z: number, yaw: number) => {
    const g = new Group(), suv = r() < 0.45, col = m(CAR_COLS[Math.floor(r() * CAR_COLS.length)], { roughness: 0.35, metalness: 0.3 });
    const glass = m('#1e2a30', { roughness: 0.15, metalness: 0.4 }), tyre = m('#161616', { roughness: 0.9 });
    const L = suv ? 4.7 : 4.6, H = suv ? 1.0 : 0.75;
    g.add(box(L, H, 1.8, col, 0, 0.35 + H / 2, 0));
    g.add(box(suv ? 3.0 : 2.4, suv ? 0.75 : 0.6, 1.62, glass, suv ? -0.35 : -0.2, 0.35 + H + (suv ? 0.37 : 0.3), 0));
    g.add(box(suv ? 2.8 : 2.0, 0.08, 1.58, col, suv ? -0.35 : -0.2, 0.35 + H + (suv ? 0.78 : 0.62), 0));
    [[1.4, 0.8], [1.4, -0.8], [-1.4, 0.8], [-1.4, -0.8]].forEach(([wx, wz]) => { const w = cyl(0.36, 0.36, 0.26, tyre, 10); w.rotation.x = Math.PI / 2; w.position.set(wx, 0.36, wz); g.add(w); });
    g.position.set(x, y, z); g.rotation.y = yaw;
    root.add(g);
  };

  /** A row of buildings wall to wall along one side of a stretch, with side streets now and then. */
  const street = (s0: number, s1: number, side: number, pick: () => FacadeKind, o: { rows?: number; ads?: number; sideStreets?: boolean; tints?: string[] } = {}) => {
    let s = s0;
    let sinceGap = 0;
    while (s < s1) {
      // Side street: a gap with a parked car or two, people, and buildings further back.
      if (o.sideStreets && sinceGap > 40 && r() < 0.18) {
        const gap = 7 + r() * 3, mid = spot(s + gap / 2, side, FRONT + 6), at = sampleAt(track, s + gap / 2);
        if (clearOf(mid.x, mid.z, 3)) {
          const yaw = Math.atan2(-at.right.z * side, at.right.x * side);
          if (r() < 0.8) car(mid.x, mid.y, mid.z, yaw + (r() - 0.5) * 0.2);
          for (let k = 0; k < 2; k++) { const p = spot(s + r() * gap, side, FRONT + 1 + r() * 10); person(p.x, p.y + PAVE_Y, p.z); }
        }
        s += gap; sinceGap = 0;
        continue;
      }
      const kind = pick(), scale = 0.9 + r() * 0.25, w = FACADES[kind].width * scale, d = 10 + r() * 3;
      const sp = spot(s + w / 2, side, FRONT);
      const back = local(sp, 0, -d / 2);
      s += w + r() * 0.25;
      sinceGap += w;
      if (nearBridge(sp.s)) continue;
      if (!clearOf(back.x, back.z, Math.max(w, d) * 0.45)) {
        // Too tight for a full building (the inside of a hairpin): a small kiosk shop instead.
        const k = local(sp, 0, -2);
        if (clearOf(k.x, k.z, 2.2)) building(sp, 'shops', 0.5, 4, { sign: false });
        continue;
      }
      building(sp, kind, scale, d, { sign: true, rooftopAd: r() < (o.ads ?? 0.06), tints: o.tints });
      // Rows behind, taller, so the skyline stays dense (two rows even on low quality).
      const rows = density > 0.55 ? (o.rows ?? 2) : Math.min(o.rows ?? 2, 2);
      for (let row = 1; row < rows; row++) {
        const k2: FacadeKind = r() < 0.5 ? 'concrete' : r() < 0.6 ? 'plaza' : 'house';
        const sp2 = spot(sp.s + (r() - 0.5) * 3, side, FRONT + row * (d + 0.5));
        const b2 = local(sp2, 0, -6);
        if (clearOf(b2.x, b2.z, 6)) building(sp2, k2, 1 + r() * 0.35, 11, { rooftopAd: r() < 0.1 });
      }
      // People on the pavement in front.
      const n = Math.round(r() * 2.5 * density);
      for (let k = 0; k < n; k++) { const p = spot(sp.s + (r() - 0.5) * w, side, hw + 1.2 + r() * (PAVEMENT - 1.4)); person(p.x, p.y + PAVE_Y, p.z); }
    }
  };

  const mixed = (): FacadeKind => { const k = r(); return k < 0.42 ? 'concrete' : k < 0.68 ? 'house' : k < 0.86 ? 'shops' : 'plaza'; };
  for (const zone of cfg.zones) {
    const { s0, s1, sides } = zoneRange(zone);
    for (const side of sides) {
      if (zone.kind === 'buildings') street(s0, s1, side, mixed, { rows: 3, sideStreets: true });
      else if (zone.kind === 'billboards') street(s0, s1, side, () => (r() < 0.6 ? 'concrete' : 'plaza'), { rows: 2, ads: 0.45 });
      else if (zone.kind === 'palms') {
        // Older houses with palm trees in the gaps between them.
        let s = s0;
        while (s < s1) {
          if (r() < 0.3) {
            const sp = spot(s + 2, side, FRONT + 1.5);
            if (!nearBridge(s) && clearOf(sp.x, sp.z, 1)) { const g = palm(m, r); g.position.set(sp.x, sp.y, sp.z); g.rotation.y = r() * 6.28; root.add(g); }
            s += 4;
            continue;
          }
          const w = FACADES.house.width;
          street(s, s + w, side, () => 'house', { rows: 2 });
          s += w + 0.2;
        }
      } else if (zone.kind === 'market') {
        // Shop rows behind, and the pavement taken over by traders.
        street(s0, s1, side, () => (r() < 0.6 ? 'shops' : 'house'), { rows: 2 });
        const UMB = ['#d0141a', '#1565c0', '#f5b400', '#2e7d32', '#6a1b9a', '#ff7043', '#00838f', '#ffffff'];
        const GOODS = ['#c62828', '#2e7d32', '#f9a825', '#8d6e63', '#ff7043', '#fdd835'];
        for (let s = s0 + 2; s < s1; s += 3.4 / density) {
          const sp = spot(s, side, hw + 1.6);
          if (nearBridge(s) || distanceToCentre(track, sp.x, sp.z) < hw + 1.2) continue;
          const g = new Group(), kind = r();
          if (kind < 0.55) {
            g.add(box(2.2, 0.1, 1.2, m('#8a5a33'), 0, 0.85, 0));
            [[-1, -0.5], [1, -0.5], [-1, 0.5], [1, 0.5]].forEach(([x, z]) => { const l = cyl(0.045, 0.045, 0.85, m('#6d4c2f'), 5); l.position.set(x, 0.42, z); g.add(l); });
            for (let k = 0; k < 4; k++) { const gd = new Mesh(new SphereGeometry(0.26, 7, 5), m(GOODS[Math.floor(r() * GOODS.length)])); gd.scale.y = 0.6; gd.position.set(-0.75 + k * 0.5, 1.02, (r() - 0.5) * 0.5); g.add(gd); }
            const pole = cyl(0.04, 0.04, 2.7, m('#dddddd', { metalness: 0.4 }), 5); pole.position.set(0, 1.35, 0); g.add(pole);
            // Umbrellas lean out over the road edge.
            const umb = new Mesh(new ConeGeometry(1.8, 0.7, 8, 1, true), m(UMB[Math.floor(r() * UMB.length)], { side: DoubleSide }));
            umb.position.set(0, 2.7, 0.3); umb.rotation.x = 0.12; g.add(umb);
          } else if (kind < 0.85) {
            [-1.3, 1.3].forEach(x => { const p = cyl(0.04, 0.04, 2.3, m('#7a7a7a', { metalness: 0.5 }), 5); p.position.set(x, 1.15, 0); g.add(p); });
            g.add(box(2.7, 0.05, 0.05, m('#7a7a7a', { metalness: 0.5 }), 0, 2.28, 0));
            const cl = new Mesh(new PlaneGeometry(2.6, 1.0), clothes); cl.position.set(0, 1.76, 0); g.add(cl);
          } else {
            g.add(box(2.4, 0.03, 1.4, m(['#1565c0', '#2e7d32', '#ef6c00'][Math.floor(r() * 3)]), 0, 0.02, 0));
            for (let k = 0; k < 7; k++) { const gd = new Mesh(new SphereGeometry(0.2, 6, 4), m(GOODS[Math.floor(r() * GOODS.length)])); gd.scale.y = 0.55; gd.position.set(-0.9 + (k % 4) * 0.6, 0.1, k < 4 ? -0.3 : 0.3); g.add(gd); }
          }
          place(g, sp, PAVE_Y);
          if (r() < 0.85) { const p = local(sp, (r() - 0.5) * 2, -0.9); person(p.x, p.y + PAVE_Y, p.z, r() < 0.5 ? 7 : 0); }
        }
      } else if (zone.kind === 'tejuosho') {
        // The market block runs the whole stretch; traders on the pavement in front.
        place(tejuoshoBlock(m, s1 - s0), spot((s0 + s1) / 2, side, FRONT), PAVE_Y);
        for (let s = s0 + 1; s < s1; s += 2.6 / density) { const p = spot(s, side, hw + 1.2 + r() * 1.6); person(p.x, p.y + PAVE_Y, p.z); }
      } else if (zone.kind === 'petrol') {
        const mid = (s0 + s1) / 2;
        const ap = zoneSign(cfg, 'ap');
        place(petrolStation(m, ap ? { name: { text: ap.text[0], bg: ap.colors.bg, fg: ap.colors.fg } } : {}), spot(mid, side, FRONT + 4), 0);
        // Okadas parked in a row on the pavement after the forecourt, riders waiting for passengers.
        for (let s = mid + 9; s < s1 + 4; s += 1.4) {
          place(parkedOkada(m, r), spot(s, side, hw + 1.6), PAVE_Y);
          if (r() < 0.35) { const p = spot(s, side, hw + 2.4); person(p.x, p.y + PAVE_Y, p.z, 4); }
        }
      } else if (zone.kind === 'lowrise') {
        street(s0, s1, side, () => (r() < 0.5 ? 'shops' : r() < 0.75 ? 'house' : 'concrete'), { rows: 2, ads: 0.04 });
      } else if (zone.kind === 'beach') {
        // Beach Road: wide and quiet, solar lights, big trees; blue kiosks on the right, generic low houses on the left.
        const northSide = 'street' in zone && zone.street === 'north';
        if (northSide) {
          for (let s = s0 + 6; s < s1 - 6; s += 30) place(kioskRow(m, 3 + Math.floor(r() * 2)), spot(s, side, FRONT + 1), PAVE_Y);
        } else street(s0, s1, side, () => (r() < 0.55 ? 'house' : 'shops'), { rows: 1 });
        for (let s = s0 + 3; s < s1; s += 36 / Math.max(0.5, density)) place(solarLight(m), spot(s, side, hw + 0.9), PAVE_Y);
        for (let s = s0 + 10; s < s1 - 4; s += 17) {
          const sp = spot(s + r() * 6, side, FRONT + 3 + r() * 3);
          if (clearOf(sp.x, sp.z, 1)) { const g = palm(m, r); g.position.set(sp.x, sp.y, sp.z); g.rotation.y = r() * 6.28; root.add(g); }
        }
      } else if (zone.kind === 'hospital') {
        place(hospitalBlocks(m, zoneSign(cfg, 'paypoint')), spot((s0 + s1) / 2, side, FRONT + 1), PAVE_Y);
        for (let s = s0; s < s1; s += 4) { const p = spot(s + r() * 3, side, hw + 1.2 + r() * 1.4); person(p.x, p.y + PAVE_Y, p.z); }
      } else if (zone.kind === 'mosque') {
        place(mosque(m, zoneSign(cfg, 'mosque')), spot((s0 + s1) / 2, side, FRONT + 2), PAVE_Y);
        for (let s = s0; s < s1; s += 3) { const p = spot(s + r() * 2, side, hw + 1.2 + r() * 1.6); person(p.x, p.y + PAVE_Y, p.z); }
      } else if (zone.kind === 'hoarding') {
        place(flyerHoarding(m, zoneSign(cfg, 'autocad')), spot((s0 + s1) / 2, side, FRONT + 1), PAVE_Y);
      } else if (zone.kind === 'kfc' || zone.kind === 'tailoring') {
        const sign = zoneSign(cfg, zone.kind);
        place(shopfront(m, { sign, w: s1 - s0, color: zone.kind === 'kfc' ? '#e6d8bd' : '#dfe3e6' }), spot((s0 + s1) / 2, side, FRONT), PAVE_Y);
        for (let s = s0; s < s1; s += 3.5) { const p = spot(s + r() * 2, side, hw + 1.2 + r() * 1.4); person(p.x, p.y + PAVE_Y, p.z); }
      } else if (zone.kind === 'tanker') {
        const sp = spot((s0 + s1) / 2, side, hw + 2.4);
        place(tankerTruck(m), sp, PAVE_Y).rotation.y = sp.yaw + Math.PI / 2;
        // A stall of colourful plastic goods under a zinc roof, and the rebar of an unfinished building.
        const st = spot(s1 + 4, side, FRONT + 0.5), goods = new Group();
        goods.add(box(4, 0.12, 2, zinc, 0, 2.4, -1)); [-1.8, 1.8].forEach(x => goods.add(box(0.1, 2.4, 0.1, m('#6d6d6d'), x, 1.2, -0.1)));
        ['#e53935', '#1e88e5', '#fdd835', '#43a047'].forEach((c, i) => goods.add(box(0.7, 0.9, 0.6, m(c), -1.4 + i * 0.95, 0.45, -1)));
        place(goods, st, PAVE_Y);
        const rb = spot(s1 + 12, side, FRONT + 3), frame = new Group();
        for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) frame.add(box(0.4, 7, 0.4, m('#8f8b84'), -3 + i * 2, 3.5, -2 - j * 4));
        frame.add(box(6.4, 0.3, 8.4, m('#8f8b84'), 0, 3.6, -4)); place(frame, rb, PAVE_Y);
      } else if (zone.kind === 'yellowBlock') {
        place(yellowBlock(m), spot((s0 + s1) / 2, side, FRONT), PAVE_Y);
      } else if (zone.kind === 'kekeRow') {
        // Yellow keke nose to tail along the kerb of the dual carriageway, and the shops behind.
        street(s0, s1, side, () => (r() < 0.6 ? 'shops' : 'house'), { rows: 2, ads: 0.04 });
        for (let s = s0 + 2; s < s1 - 2; s += 3.2) {
          place(parkedKeke(m), spot(s, side, hw + 1.9), PAVE_Y);
          if (r() < 0.4) { const p = spot(s + 1.5, side, hw + 1.1); person(p.x, p.y + PAVE_Y, p.z, 4); }
        }
      } else if (zone.kind === 'danfoRow') {
        // The shopping complex with yellow danfos lined up nose to tail along the kerb.
        street(s0, s1, side, () => (r() < 0.6 ? 'plaza' : 'concrete'), { rows: 2 });
        for (let s = s0 + 3; s < s1 - 2; s += 5) {
          place(parkedDanfo(m, r), spot(s, side, hw + 2.2), PAVE_Y);
          if (r() < 0.5) { const p = spot(s + 2.4, side, hw + 1.2); person(p.x, p.y + PAVE_Y, p.z, [4, 2, 5][Math.floor(r() * 3)]); }
        }
      } else if (zone.kind === 'church') {
        place(church(m, 'GRACE BAPTIST CHURCH'), spot((s0 + s1) / 2, side, FRONT), PAVE_Y);
      } else if (zone.kind === 'sportsShops') {
        // Shops painted red, blue and cream, covered in signboards.
        street(s0, s1, side, () => (r() < 0.7 ? 'shops' : 'concrete'), { rows: 2, ads: 0.2, tints: ['#d0141a', '#1565c0', '#f2d0a4', '#1565c0'] });
      } else if (zone.kind === 'danfoPark') {
        // The one open lot: danfos parked nose-in, the motor park arch, agberos everywhere.
        const lot0 = s0 + 4, lot1 = Math.min(s1 - 4, lot0 + 38);
        street(s0, lot0, side, mixed, { rows: 2 });
        street(lot1, s1, side, mixed, { rows: 2 });
        for (let s = lot0 + 3; s < lot1 - 2; s += 4.2) {
          const sp = spot(s, side, FRONT + 5);
          if (!clearOf(sp.x, sp.z, 3)) continue;
          const g = parkedDanfo(m, r);
          g.rotation.y = sp.yaw + Math.PI / 2 + (r() - 0.5) * 0.15;
          g.position.set(sp.x, sp.y, sp.z);
          root.add(g);
          for (let k = 0; k < 2; k++) { const p = spot(s + r() * 3, side, hw + 1.2 + r() * 8); person(p.x, p.y + PAVE_Y, p.z, [4, 4, 2, 5, 3][Math.floor(r() * 5)]); }
        }
        const mid = spot((lot0 + lot1) / 2, side, FRONT + 0.5);
        const g = new Group();
        [-6, 6].forEach(x => { const p = cyl(0.25, 0.25, 6, m('#2e7d32'), 8); p.position.set(x, 3, 0); g.add(p); });
        g.add(box(13, 1.4, 0.3, m('#2e7d32'), 0, 6.2, 0));
        const t = signs.plane(SHOP_SIGNS.indexOf('JESUS IS LORD MOTOR PARTS'), 11, 1.1); t.position.set(0, 6.2, 0.17); g.add(t);
        place(g, mid);
        // Buildings across the back of the lot.
        for (let s = lot0; s < lot1;) {
          const kind = mixed(), w = FACADES[kind].width;
          const bsp = spot(s + w / 2, side, FRONT + 14), b = local(bsp, 0, -5);
          if (clearOf(b.x, b.z, 6)) building(bsp, kind, 1, 10, { sign: true });
          s += w + 0.2;
        }
      }
    }
  }

  // Concrete electricity poles with sagging wires along both sides (and now and then across).
  const isMedian = (s: number) => !!median?.[sampleAt(track, s).index];
  poles(root, track, hw + 0.9, PAVE_Y, m, r, median);

  // Street lamps with banner ads, on the pavement; on the median, down the middle with an arm over each leg.
  const lampPole = m('#6b6f73', { metalness: 0.6, roughness: 0.4 }), lampHead = m('#fff8d6', { emissive: '#fff1b0' });
  const lamp = (sp: Spot, arm: number) => {
    const g = new Group();
    const p = cyl(0.09, 0.12, 9, lampPole, 6); p.position.y = 4.5; g.add(p);
    [-1, 1].forEach(k => { g.add(box(0.1, 0.1, arm, lampPole, 0, 8.9, k * arm / 2)); g.add(box(0.5, 0.16, 0.7, lampHead, 0, 8.8, k * (arm - 0.1))); });
    const banner = boards.plane(Math.floor(r() * BILLBOARDS.length), 1.6, 0.8); banner.position.set(0.12, 6.4, 0); banner.rotation.y = Math.PI / 2; g.add(banner);
    place(g, sp, PAVE_Y);
  };
  let flip = 1;
  for (let s = 12; s < track.length; s += 40 / Math.max(0.5, density)) {
    flip = -flip;
    if (flip < 0 && isMedian(s)) continue;
    lamp(spot(s, flip, hw + 0.75), 2.0);
  }
  if (median && cfg.median) {
    // Both legs border the median: place each lamp once.
    const placed: Spot[] = [];
    for (let s = 6; s < track.length; s += 30 / Math.max(0.5, density)) {
      if (!isMedian(s)) continue;
      const sp = spot(s, -1, hw + cfg.median.width / 2);
      if (placed.some(q => Math.hypot(q.x - sp.x, q.z - sp.z) < 12)) continue;
      placed.push(sp);
      lamp(sp, 4.0);
    }
  }

  // Spectators on the pavement at the start line (not on the median).
  for (const side of [-1, 1]) for (let k = 0; k < 14 * density; k++) {
    if (side < 0 && isMedian(0)) break;
    const p = spot(-14 + k * 2.2 + r(), side, hw + 1.1 + r() * 1.8); person(p.x, p.y + PAVE_Y, p.z);
  }

  // Flyovers, the start gantry, and a ring of buildings in front of the painted skyline.
  bridgeAt.forEach(b => root.add(bridge(track, cfg, b.s, b.name, m, { depth: b.width, median: cfg.median?.width })));
  for (const isl of cfg.islands ?? []) {
    const c = axisPoint(cfg.axis!, isl.road), g = statueIsland(m, isl.radius);
    g.position.set(c.x, heightAt(track, c.x, c.z), c.z);
    root.add(g);
    if (isl.backdrop) {
      // Seen across the roundabout: the red TCL building to the west and the blue bus-terminal canopy to the east.
      const aim = (lx: number, ln: number, g2: Group) => {
        const x = c.x + c.tx * lx + c.nx * ln, z = c.z + c.tz * lx + c.nz * ln;
        g2.position.set(x, heightAt(track, c.x, c.z), z);
        g2.rotation.y = Math.atan2(c.x - x, c.z - z);
        root.add(g2);
      };
      aim(34, -24, redBlock(m, zoneSign(cfg, 'tcl')));
      aim(32, 26, terminalCanopy());
    }
  }
  for (const sg of cfg.signs ?? []) {
    const g = directionSign(m, sg.text, 2 * (hw + 1.2));
    // Spot frames run x along the road; the sign spans across it.
    place(g, spot(onLap(sg.road, 'north'), 1, 0)).rotation.y += Math.PI / 2;
  }
  root.add(gantry(track, cfg, m));
  const ring = horizonRing(track);
  const nRing = Math.round(70 * density);
  for (let i = 0; i < nRing; i++) {
    const a = (i / nRing) * Math.PI * 2 + r() * 0.04, d = ring.radius + r() * 40;
    const x = ring.cx + Math.cos(a) * d, z = ring.cz + Math.sin(a) * d;
    if (distanceToCentre(track, x, z) < 40) continue;
    const fx = ring.cx - x, fz = ring.cz - z;
    building({ x, y: heightAt(track, x, z) - 0.5, z, yaw: Math.atan2(fx, fz), s: 0, side: 1 }, r() < 0.5 ? 'concrete' : 'plaza', 1.2 + r() * 0.8, 12, { rooftopAd: r() < 0.08 });
  }

  const facadeMat = new MeshStandardMaterial({ map: facadeAtlas(), vertexColors: true, roughness: 0.85 });
  facadeMat.userData.castShadow = true;
  for (const geos of bGeos.values()) {
    root.add(new Mesh(mergeGeometries(geos), facadeMat));
    geos.forEach(g => g.dispose());
  }

  const out = chunkAndMerge(root);
  out.add(makeCrowd(crowd));
  return out;
}

const wrap = (d: number, L: number) => ((((d + L / 2) % L) + L) % L) - L / 2;

function horizonRing(track: Track) {
  const xs = track.points.map(p => p.pos.x), zs = track.points.map(p => p.pos.z);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const radius = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) / 2 + 55;
  return { cx, cz, radius };
}

/**
 * Concrete poles along both pavements, with wires sagging between neighbours (thin boxes, so they
 * merge with everything else), and every third pair joined by a wire across the road.
 */
function poles(root: Group, track: Track, offset: number, lift: number, m: MatFn, r: () => number, median: boolean[] | null) {
  const concrete = m('#a9a59c', { roughness: 0.9 }), wire = m('#1a1a1a', { roughness: 0.8 });
  const span = 26, H = 9.2, tops: Vector3[][] = [[], []];
  for (let s = 6, i = 0; s < track.length - span / 2; s += span, i++) {
    const at = sampleAt(track, s + (r() - 0.5) * 3);
    // No poles on the median side, and so no wires across the road there either.
    const left = !median?.[at.index];
    [-1, 1].forEach((side, k) => {
      if (side < 0 && !left) return;
      const x = at.pos.x + at.right.x * offset * side, z = at.pos.z + at.right.z * offset * side, y = at.pos.y + lift;
      const g = new Group();
      const p = new Mesh(new CylinderGeometry(0.1, 0.16, H, 6), concrete); p.position.y = H / 2; g.add(p);
      const arm = new Mesh(new BoxGeometry(0.1, 0.1, 1.8), concrete); arm.position.y = H - 0.4; g.add(arm);
      g.position.set(x, y, z); g.rotation.y = Math.atan2(at.tangent.x, at.tangent.z) + Math.PI / 2;
      root.add(g);
      tops[k].push(new Vector3(x, y + H - 0.35, z));
      // Every third pair of poles gets a wire across the road.
      if (i % 3 === 1 && k === 1 && left) wireBetween(root, tops[0][tops[0].length - 1], tops[1][tops[1].length - 1], 1.2, wire);
    });
  }
  for (const list of tops) for (let i = 0; i < list.length; i++) {
    const a = list[i], b = list[(i + 1) % list.length];
    if (a.distanceTo(b) > 50) continue;
    for (const dy of [0, -0.45]) wireBetween(root, a.clone().setY(a.y + dy), b.clone().setY(b.y + dy), 0.9, wire);
  }
}

function wireBetween(root: Group, a: Vector3, b: Vector3, sag: number, mat: Material) {
  const n = 6, pts: Vector3[] = [];
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push(a.clone().lerp(b, t).setY(a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t))); }
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[i + 1], len = p.distanceTo(q);
    const seg = new Mesh(new BoxGeometry(0.035, 0.035, len), mat);
    seg.position.copy(p).add(q).multiplyScalar(0.5);
    seg.lookAt(q);
    root.add(seg);
  }
}

const CELL = 70;
const cellKey = (x: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;

/**
 * Merge scenery per material within ~70 m cells rather than across the whole map. A few hundred
 * draw calls become a few dozen, while each merged mesh stays small enough to be frustum-culled,
 * and the sun's shadow pass only draws the cells near the player.
 */
function chunkAndMerge(root: Group): Group {
  const cells = new Map<string, Group>(), out = new Group(), p = new Vector3();
  root.updateMatrixWorld(true);
  for (const child of [...root.children]) {
    p.setFromMatrixPosition(child.matrixWorld);
    if ((child as Mesh).isMesh) {
      const m = child as Mesh;
      m.geometry.computeBoundingSphere();
      p.copy(m.geometry.boundingSphere!.center).applyMatrix4(m.matrixWorld);
    }
    const key = cellKey(p.x, p.z);
    if (!cells.has(key)) cells.set(key, new Group());
    cells.get(key)!.add(child);
  }
  for (const g of cells.values()) { mergeStatic(g, new Set(), { flatColors: true }); out.add(g); }
  // Only big shapes cast shadows (buildings, roofs, the flyover); small props would double the
  // draw calls for barely visible shadows.
  out.traverse(o => { const m = o as Mesh; if (m.isMesh) { m.receiveShadow = true; m.castShadow = !!(m.material as Material).userData.castShadow; } });
  return out;
}

function parkedDanfo(m: MatFn, r: () => number) {
  const g = new Group();
  const Y = m('#f2a900', { roughness: 0.45 }), K = m('#1d1c1b'), GL = m('#2b3a42', { roughness: 0.2, metalness: 0.3 });
  const body = new Mesh(new BoxGeometry(4.4, 1.5, 1.8), Y); body.position.y = 1.25; g.add(body);
  const roof = new Mesh(new BoxGeometry(4.0, 0.25, 1.7), Y); roof.position.y = 2.1; g.add(roof);
  [0.95, 1.1].forEach(y => { const st = new Mesh(new BoxGeometry(4.42, 0.06, 1.82), K); st.position.y = y; g.add(st); });
  const win = new Mesh(new BoxGeometry(3.6, 0.5, 1.84), GL); win.position.set(-0.2, 1.65, 0); g.add(win);
  const ws = new Mesh(new BoxGeometry(0.1, 0.6, 1.6), GL); ws.position.set(2.2, 1.6, 0); ws.rotation.z = 0.25; g.add(ws);
  [[1.4, 0.8], [1.4, -0.8], [-1.4, 0.8], [-1.4, -0.8]].forEach(([x, z]) => { const w = new Mesh(new CylinderGeometry(0.4, 0.4, 0.3, 10), K); w.rotation.x = Math.PI / 2; w.position.set(x, 0.4, z); g.add(w); });
  if (r() < 0.5) { const load = new Mesh(new BoxGeometry(1.2, 0.6, 1.0), m('#b58a55')); load.position.set(-0.8, 2.5, 0); g.add(load); }
  return g;
}

function palm(m: MatFn, r: () => number) {
  const g = new Group(), trunkM = m('#8d6e4f', { roughness: 0.9, shadow: true }), frondM = m('#2e8b3a', { roughness: 0.7, side: DoubleSide, shadow: true });
  const h = 6 + r() * 3, lean = (r() - 0.5) * 0.3;
  const t1 = new Mesh(new CylinderGeometry(0.22, 0.3, h * 0.55, 7), trunkM); t1.position.y = h * 0.27; g.add(t1);
  const t2 = new Mesh(new CylinderGeometry(0.18, 0.22, h * 0.5, 7), trunkM); t2.position.set(lean * h * 0.3, h * 0.75, 0); t2.rotation.z = -lean; g.add(t2);
  const top = new Vector3(lean * h * 0.55, h, 0);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const f = new Mesh(new ConeGeometry(0.55, 3.4, 4, 1), frondM);
    f.scale.set(1, 1, 0.18);
    f.position.set(top.x + Math.cos(a) * 1.4, top.y - 0.5, top.z + Math.sin(a) * 1.4);
    f.rotation.set(0, -a, 0); f.rotateZ(-Math.PI / 2 - 0.45);
    g.add(f);
  }
  for (let i = 0; i < 3; i++) { const c = new Mesh(new SphereGeometry(0.2, 6, 4), m('#5d4037')); c.position.set(top.x + Math.cos(i * 2) * 0.3, top.y - 0.3, top.z + Math.sin(i * 2) * 0.3); g.add(c); }
  return g;
}

/**
 * A flyover crossing the road at s. Over an out-and-back road (median width given) it spans both legs:
 * the deck is centred on the median and the pillars stand outside each leg and in the median.
 * `depth` is the deck's size along the road (Western Avenue is a wide one).
 */
function bridge(track: Track, cfg: TrackConfig, s: number, name: string, m: MatFn, o: { depth?: number; median?: number } = {}) {
  const at = sampleAt(track, s), g = new Group(), hw = cfg.halfWidth, depth = o.depth ?? 13;
  const concrete = m('#b9b4aa', { roughness: 0.9, shadow: true }), dark = m('#8f8a80', { roughness: 0.9, shadow: true });
  const y = 7.6, mw = o.median;
  // Build along local x = across the road, local z = along the road, then rotate into place.
  // Local +x is the road's left (lateral L sits at x = -L).
  const centre = mw === undefined ? 0 : hw + mw / 2;
  const half = mw === undefined ? hw + 30 : 2 * hw + mw / 2 + 22;
  const candidates: [number, number][] = mw === undefined
    ? [-(hw + 1.4), hw + 1.4, -(hw + 20), hw + 20].map(x => [x, 1.6])
    : [[-(hw + 1.4), 1.6], [-(hw + 20), 1.6], [hw + mw / 2, 0.9], [3 * hw + mw + 1.4, 1.6], [3 * hw + mw + 20, 1.6]];
  // Where the legs splay into a U-turn under the deck, a pillar can land in the road: keep only clear ones.
  const clear = (x: number, z: number, size: number) =>
    distanceToCentre(track, at.pos.x - at.right.x * x + at.tangent.x * z, at.pos.z - at.right.z * x + at.tangent.z * z) > hw + size / 2 + 0.3;
  const deck = new Mesh(new BoxGeometry(half * 2, 1.3, depth), concrete); deck.position.set(centre, y, 0); g.add(deck);
  const under = new Mesh(new BoxGeometry(half * 2, 0.4, depth - 2), dark); under.position.set(centre, y - 0.8, 0); g.add(under);
  [-1, 1].forEach(side => {
    const rail = new Mesh(new BoxGeometry(half * 2, 1.1, 0.3), concrete); rail.position.set(centre, y + 1.2, side * (depth / 2 - 0.1)); g.add(rail);
    for (const [x, size] of candidates) {
      const z = side * (depth / 2 - 3);
      if (!clear(x, z, size)) continue;
      const p = new Mesh(new BoxGeometry(size, y, size), concrete); p.position.set(x, y / 2 - 0.6, z); g.add(p);
    }
  });
  // Name boards on both faces.
  const label = canvasTex(1024, 128, (x, w, h) => {
    x.fillStyle = '#1f6e3d'; x.fillRect(0, 0, w, h); x.strokeStyle = '#fff'; x.lineWidth = 6; x.strokeRect(8, 8, w - 16, h - 16);
    x.fillStyle = '#fff'; x.font = '900 84px Archivo, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(name, w / 2, h / 2 + 4);
  });
  const lm = new MeshStandardMaterial({ map: label, roughness: 0.6 });
  [-1, 1].forEach(side => {
    const p = new Mesh(new PlaneGeometry(14, 1.75), lm);
    p.position.set(centre, y + 0.1, side * (depth / 2 + 0.12)); p.rotation.y = side > 0 ? 0 : Math.PI; g.add(p);
  });
  // A couple of danfos stuck in traffic on top.
  const r = rng(9);
  [-14, -4, 9].forEach((x, i) => { const d = parkedDanfo(m, r); d.position.set(centre + x, y + 0.65, i % 2 ? 2.8 : -2.8); g.add(d); });
  g.position.set(at.pos.x, at.pos.y, at.pos.z);
  g.rotation.y = Math.atan2(at.tangent.x, at.tangent.z);
  return g;
}

function gantry(track: Track, cfg: TrackConfig, m: MatFn) {
  const at = sampleAt(track, 0), g = new Group(), w = cfg.halfWidth + 1.2;
  const post = m('#1d1c1b', { shadow: true }), yellow = m('#f5b400', { roughness: 0.4, shadow: true });
  [-1, 1].forEach(s => { const p = new Mesh(new BoxGeometry(0.7, 7.5, 0.7), post); p.position.set(s * w, 3.75, 0); g.add(p); });
  const beam = new Mesh(new BoxGeometry(w * 2 + 0.7, 1.8, 0.8), yellow); beam.position.y = 7.4; g.add(beam);
  const banner = canvasTex(1024, 128, (x, cw, ch) => {
    x.fillStyle = '#141210'; x.fillRect(0, 0, cw, ch);
    for (let i = 0; i < 32; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? '#fff' : '#141210'; x.fillRect(i * 32, j * 16, 32, 16); x.fillRect(i * 32, ch - 32 + j * 16, 32, 16); }
    x.fillStyle = '#ffb21a'; x.font = '400 64px Bungee, Impact, Arial Black'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('OJUELEGBA GRAND PRIX', cw / 2, ch / 2 + 4);
  });
  const bm = new MeshStandardMaterial({ map: banner, emissive: new Color(0.25, 0.25, 0.25), emissiveMap: banner });
  [-1, 1].forEach(s => { const p = new Mesh(new PlaneGeometry(w * 2 - 0.5, 1.5), bm); p.position.set(0, 7.4, s * 0.41); p.rotation.y = s > 0 ? 0 : Math.PI; g.add(p); });
  g.position.set(at.pos.x, at.pos.y, at.pos.z);
  g.rotation.y = Math.atan2(at.tangent.x, at.tangent.z);
  return g;
}
