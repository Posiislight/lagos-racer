import { BoxGeometry, ConeGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial, PlaneGeometry, SphereGeometry, type Material } from 'three';
import { canvasTex } from './trackGeometry';
import type { MatFn } from './scenery';
import type { Sign } from '../config/signs/ikorodu';

/**
 * Landmarks of the Ikorodu Garage route, from the Street View stops listed in the track spec. Same local
 * frame as landmarks.ts: x along the road, +z towards it, front face at z = 0, ground at y = 0. Real signs
 * are drawn as lettering in their brand colours (see signBoard); with no sign given, no lettering is drawn.
 */

const box = (w: number, h: number, d: number, mat: Material, x = 0, y = 0, z = 0) => {
  const o = new Mesh(new BoxGeometry(w, h, d), mat); o.position.set(x, y, z); return o;
};
const cyl = (rt: number, rb: number, h: number, mat: Material, seg = 10) => new Mesh(new CylinderGeometry(rt, rb, h, seg), mat);

/** A real sign: its lines of lettering centred in its brand colours, nothing else (no logo artwork). */
export function signBoard(sign: Sign, w: number, h: number) {
  const tex = canvasTex(512, Math.max(64, Math.round(512 * h / w)), (x, cw, ch) => {
    x.fillStyle = sign.colors.bg; x.fillRect(0, 0, cw, ch);
    x.fillStyle = sign.colors.fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    const n = sign.text.length, lineH = ch / n;
    sign.text.forEach((t, i) => {
      let fs = Math.round(lineH * 0.72); do { x.font = `900 ${fs}px Archivo, Arial`; fs -= 2; } while (x.measureText(t).width > cw - 24 && fs > 10);
      x.fillText(t, cw / 2, lineH * (i + 0.5) + 2);
    });
  });
  return new Mesh(new PlaneGeometry(w, h), new MeshStandardMaterial({ map: tex, roughness: 0.6 }));
}

/** Oriwu Central Mosque: cream block, gold dome, four minarets, the name across the front. */
export function mosque(m: MatFn, sign?: Sign) {
  const g = new Group(), cream = m('#efe6cf', { shadow: true }), gold = m('#d4a72c', { roughness: 0.35, metalness: 0.5 });
  g.add(box(18, 8, 8, cream, 0, 4, -4));
  g.add(box(18.4, 0.5, 8.4, m('#c9bd9c'), 0, 8.2, -4));
  const dome = new Mesh(new SphereGeometry(3.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), gold); dome.position.set(0, 8.4, -4); g.add(dome);
  for (const x of [-8.3, 8.3]) for (const z of [-0.9, -7.1]) {
    const t = cyl(0.55, 0.7, 15, cream); t.position.set(x, 7.5, z); g.add(t);
    const cap = new Mesh(new ConeGeometry(0.8, 1.6, 10), gold); cap.position.set(x, 15.8, z); g.add(cap);
    g.add(box(1.6, 0.25, 1.6, m('#c9bd9c'), x, 11, z));
  }
  for (const x of [-5.5, 0, 5.5]) g.add(box(2.2, 3.4, 0.1, m('#3b4a3f'), x, 2.1, 0.02));
  if (sign) { const b = signBoard(sign, 13, 1.3); b.position.set(0, 6.3, 0.06); g.add(b); }
  return g;
}

/** A hoarding of flyers on two posts; one flyer carries a real sign's lettering. */
export function flyerHoarding(m: MatFn, sign?: Sign) {
  const g = new Group(), post = m('#555a5e', { metalness: 0.5 });
  [-4.2, 4.2].forEach(x => g.add(box(0.25, 5.2, 0.25, post, x, 2.6, -0.2)));
  const flyers = canvasTex(512, 224, (x, w, h) => {
    x.fillStyle = '#e8e4da'; x.fillRect(0, 0, w, h);
    const cols = ['#e53935', '#fdd835', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#ffffff'];
    for (let i = 0; i < 28; i++) {
      const cx = (i % 7) * (w / 7), cy = Math.floor(i / 7) * (h / 4);
      x.fillStyle = cols[(i * 5 + 2) % cols.length]; x.fillRect(cx + 3, cy + 3, w / 7 - 6, h / 4 - 6);
      x.fillStyle = 'rgba(0,0,0,.25)'; for (let k = 0; k < 3; k++) x.fillRect(cx + 10, cy + 30 + k * 12, w / 7 - 26, 4);
    }
  });
  const board = new Mesh(new PlaneGeometry(9, 4), new MeshStandardMaterial({ map: flyers, roughness: 0.8 }));
  board.position.set(0, 4, 0.01); g.add(board);
  if (sign) { const f = signBoard(sign, 2.4, 1.1); f.position.set(-2.6, 4.7, 0.03); g.add(f); }
  return g;
}

/** The red building behind the roundabout, with a real sign over the door. */
export function redBlock(m: MatFn, sign?: Sign) {
  const g = new Group();
  g.add(box(16, 10, 10, m('#b3262b', { shadow: true }), 0, 5, -5));
  for (let f = 0; f < 2; f++) g.add(box(14, 1.1, 0.1, m('#27323a', { roughness: 0.2 }), 0, 3.4 + f * 3.2, 0.03));
  if (sign) { const b = signBoard(sign, 6, 1.6); b.position.set(0, 8.6, 0.06); g.add(b); }
  return g;
}

/** A blue arched bus-terminal canopy, as a backdrop. */
export function terminalCanopy() {
  const g = new Group();
  const arch = new Mesh(new CylinderGeometry(6, 6, 22, 16, 1, true, 0, Math.PI), new MeshStandardMaterial({ color: '#1f5fb0', roughness: 0.5, side: DoubleSide }));
  arch.rotation.z = Math.PI / 2; arch.position.set(0, 0, -6);
  g.add(arch);
  return g;
}

/** Pink and yellow single-storey hospital blocks with barred windows and a covered walkway. */
export function hospitalBlocks(m: MatFn, sign?: Sign) {
  const g = new Group(), dark = m('#2f2f33');
  for (const [c, x] of [['#e9a3b5', -7.5], ['#f2d27a', 7.5]] as const) {
    g.add(box(14, 3.6, 7, m(c, { shadow: true }), x, 1.8, -5));
    for (let k = -2; k <= 2; k++) g.add(box(1.4, 1.2, 0.1, dark, x + k * 2.6, 2.1, -1.47));
  }
  g.add(box(30, 0.2, 2.6, m('#8a8f93'), 0, 3.3, -0.4));
  for (let x = -14; x <= 14; x += 4.7) g.add(box(0.2, 3.2, 0.2, dark, x, 1.6, 0.8));
  if (sign) { const b = signBoard(sign, 5, 1.5); b.position.set(0, 2.4, 0.95); g.add(b); }
  return g;
}

/** A row of blue-painted kiosks. */
export function kioskRow(m: MatFn, n = 4) {
  const g = new Group(), blue = m('#2a63b8', { shadow: true }), zinc = m('#9aa0a4', { metalness: 0.3 });
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 3.3;
    g.add(box(2.6, 2.3, 2.4, blue, x, 1.15, -2));
    const aw = box(2.9, 0.08, 1.4, zinc, x, 2.2, -0.4); aw.rotation.x = 0.15; g.add(aw);
    g.add(box(1.1, 1.0, 0.05, m('#f5d77a'), x, 1.3, -0.78));
  }
  return g;
}

/** A solar street light: pole, panel and lamp arm. */
export function solarLight(m: MatFn) {
  const g = new Group(), metal = m('#6b6f73', { metalness: 0.6, roughness: 0.4 });
  const p = cyl(0.08, 0.1, 7, metal, 6); p.position.y = 3.5; g.add(p);
  const panel = box(1.4, 0.06, 0.9, m('#1c2a4a', { roughness: 0.2, metalness: 0.4 }), 0, 7.2, 0); panel.rotation.z = 0.35; g.add(panel);
  g.add(box(0.2, 0.2, 1.4, metal, 0, 6.9, 0.7));
  g.add(box(0.5, 0.12, 0.3, m('#fff8d6', { emissive: '#fff1b0' }), 0, 6.8, 1.4));
  return g;
}

/** A parked tanker: white tank, yellow cab, facing along the road. */
export function tankerTruck(m: MatFn) {
  const g = new Group(), tyre = m('#161616', { roughness: 0.9 });
  g.add(box(2.2, 2.0, 2.4, m('#f2b705'), 3.6, 1.7, 0));
  g.add(box(0.1, 0.7, 2.2, m('#1e2a30', { roughness: 0.15 }), 4.72, 2.2, 0));
  const tank = cyl(1.15, 1.15, 6.4, m('#f4f4f0', { roughness: 0.4, shadow: true }), 14); tank.rotation.z = Math.PI / 2; tank.position.set(-0.4, 2.1, 0); g.add(tank);
  g.add(box(7.4, 0.3, 1.8, m('#3a3a3a'), 0, 0.8, 0));
  [-2.8, -1.6, 3.4].forEach(x => [-1.1, 1.1].forEach(z => { const w = cyl(0.5, 0.5, 0.4, tyre); w.rotation.x = Math.PI / 2; w.position.set(x, 0.5, z); g.add(w); }));
  return g;
}

/** An old 2 to 3 storey shop with a balcony and a red corrugated awning; a real sign goes on the awning fascia. */
export function shopfront(m: MatFn, o: { sign?: Sign; w?: number; color?: string } = {}) {
  const w = o.w ?? 11, g = new Group();
  g.add(box(w, 8.4, 9, m(o.color ?? '#e6d8bd', { shadow: true }), 0, 4.2, -4.5));
  g.add(box(w, 0.2, 1.2, m('#d8d2c6'), 0, 3.9, 0.6));
  g.add(box(w, 0.9, 0.08, m('#5b4636'), 0, 4.45, 1.2));
  const aw = box(w, 0.08, 2.2, m('#b5372c', { roughness: 0.8 }), 0, 3.0, 0.9); aw.rotation.x = 0.16; g.add(aw);
  for (const k of [-1, 1]) g.add(box(0.1, 2.9, 0.1, m('#6d6d6d'), k * (w / 2 - 0.4), 1.45, 1.9));
  for (let k = -2; k <= 2; k++) g.add(box(1.0, 1.3, 0.08, m('#3a4a52'), k * (w / 5.5), 6.4, 0.02));
  if (o.sign) { const b = signBoard(o.sign, Math.min(w * 0.8, 8), 1.2); b.position.set(0, 3.5, 2.0); g.add(b); }
  return g;
}

/** The yellow 3-storey building with an orange roof, behind a pink perimeter wall and railing. */
export function yellowBlock(m: MatFn) {
  const g = new Group();
  g.add(box(12, 10.5, 10, m('#f2c94c', { shadow: true }), 0, 5.25, -7));
  g.add(box(12.8, 0.5, 10.8, m('#e07b1c'), 0, 10.7, -7));
  const roof = new Mesh(new ConeGeometry(8.6, 2.2, 4), m('#e07b1c')); roof.rotation.y = Math.PI / 4; roof.position.set(0, 12, -7); g.add(roof);
  for (let f = 0; f < 3; f++) for (let k = -2; k <= 2; k++) g.add(box(1.1, 1.3, 0.08, m('#5b3a1e'), k * 2.2, 2 + f * 3.1, -1.97));
  g.add(box(18, 2, 0.3, m('#e9a3b5'), 0, 1, 0));
  const bars = m('#3d3d3d', { metalness: 0.4 });
  g.add(box(18, 0.06, 0.06, bars, 0, 2.9, 0));
  for (let x = -8.8; x <= 8.8; x += 0.7) g.add(box(0.05, 0.9, 0.05, bars, x, 2.45, 0));
  return g;
}

/** A parked keke: yellow body, black roof, three wheels, facing along the road. */
export function parkedKeke(m: MatFn) {
  const g = new Group(), yellow = m('#f2b705', { roughness: 0.45 }), black = m('#1d1c1b');
  g.add(box(2.2, 0.9, 1.3, yellow, 0, 0.85, 0));
  g.add(box(1.7, 0.1, 1.4, black, -0.2, 1.95, 0));
  for (const [x, z] of [[0.7, 0.62], [0.7, -0.62], [-0.7, 0.62], [-0.7, -0.62]]) g.add(box(0.1, 0.9, 0.06, black, x, 1.5, z));
  for (const [x, z] of [[0.9, 0], [-0.8, 0.7], [-0.8, -0.7]]) { const w = cyl(0.3, 0.3, 0.2, black, 8); w.rotation.x = Math.PI / 2; w.position.set(x, 0.3, z); g.add(w); }
  return g;
}
