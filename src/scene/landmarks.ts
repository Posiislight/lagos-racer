import { BoxGeometry, Color, CylinderGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry, RepeatWrapping, type Material } from 'three';
import { canvasTex } from './trackGeometry';
import type { MatFn } from './scenery';

/**
 * The landmarks of Ojuelegba Road, from the Street View walk: the Tejuosho market block, the petrol
 * station, the church, the green direction sign and parked okadas. Each builder returns a group in a
 * local frame like the street buildings: x along the road, +z towards it, front face at z = 0,
 * ground at y = 0. Detail goes into small painted textures so the shapes stay a few boxes.
 */

const box = (w: number, h: number, d: number, mat: Material, x = 0, y = 0, z = 0) => {
  const o = new Mesh(new BoxGeometry(w, h, d), mat); o.position.set(x, y, z); return o;
};

/** A painted sign: text centred on a coloured board. */
function label(text: string, bg: string, fg: string, w = 1024, h = 128) {
  const tex = canvasTex(w, h, (x, cw, ch) => {
    x.fillStyle = bg; x.fillRect(0, 0, cw, ch);
    x.strokeStyle = fg; x.lineWidth = 6; x.strokeRect(8, 8, cw - 16, ch - 16);
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    let fs = Math.round(ch * 0.62); do { x.font = `900 ${fs}px Archivo, Arial`; fs -= 2; } while (x.measureText(text).width > cw - 60 && fs > 12);
    x.fillText(text, cw / 2, ch / 2 + 3);
  });
  return new MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: new Color(0.12, 0.12, 0.12), emissiveMap: tex });
}

let marketWall: MeshStandardMaterial | null = null;
/** One storey bay of the market block, repeated: grey concrete, long louvre windows, rust streaks. */
function marketWallMaterial() {
  if (marketWall) return marketWall;
  const tex = canvasTex(256, 128, (x, w, h) => {
    x.fillStyle = '#c9c7c0'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#5d6266'; x.fillRect(w * 0.12, h * 0.28, w * 0.76, h * 0.42);
    x.fillStyle = 'rgba(255,255,255,.18)'; for (let i = 0; i < 6; i++) x.fillRect(w * 0.12, h * (0.3 + i * 0.065), w * 0.76, 2);
    x.fillStyle = 'rgba(110,80,50,.22)'; x.fillRect(w * 0.2, h * 0.7, 6, h * 0.3); x.fillRect(w * 0.75, h * 0.7, 4, h * 0.25);
  }, true);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  marketWall = new MeshStandardMaterial({ map: tex, roughness: 0.9 });
  marketWall.userData.castShadow = true;
  return marketWall;
}

/** The Tejuosho market: a long grey five-storey block with balconies and railings on every floor. */
export function tejuoshoBlock(m: MatFn, length: number) {
  const g = new Group(), storey = 3.2, floors = 5, H = storey * floors, D = 14;
  const wall = marketWallMaterial().clone();
  wall.map = wall.map!.clone(); wall.map.repeat.set(length / 6, floors); wall.map.needsUpdate = true;
  g.add(box(length, H, D, wall, 0, H / 2, -D / 2));
  const slab = m('#d8d6cf', { shadow: true }), rail = m('#4b4f52', { metalness: 0.4 }), col = m('#bdbab2');
  for (let f = 1; f < floors; f++) {
    g.add(box(length, 0.2, 1.4, slab, 0, f * storey, 0.7));
    g.add(box(length, 0.06, 0.06, rail, 0, f * storey + 0.95, 1.38));
    g.add(box(length, 0.9, 0.03, m('#7b8084', { metalness: 0.3 }), 0, f * storey + 0.5, 1.39));
  }
  for (let x = -length / 2 + 3; x < length / 2; x += 6) g.add(box(0.5, H, 0.5, col, x, H / 2, 1.2));
  // Shop shutters along the ground floor and the market's name across the top.
  const shutter = m('#8a8f93', { metalness: 0.35 });
  for (let x = -length / 2 + 1.5; x < length / 2 - 1; x += 3) g.add(box(2.4, 2.4, 0.1, shutter, x + 1, 1.2, 0.05));
  const name = new Mesh(new PlaneGeometry(Math.min(length * 0.7, 30), 1.8), label('TEJUOSHO MARKET', '#1f6e3d', '#ffffff'));
  name.position.set(0, H - 1.2, 0.06); g.add(name);
  return g;
}

/** A petrol station: white canopy with a green band, two pumps, a price board. */
export function petrolStation(m: MatFn) {
  const g = new Group(), white = m('#f4f4f0', { roughness: 0.4, shadow: true }), green = m('#1e8a46', { roughness: 0.4 });
  g.add(box(16, 0.06, 12, m('#9a9890', { roughness: 0.95 }), 0, 0.2, -2));
  g.add(box(14, 0.7, 9, white, 0, 5.6, -2));
  g.add(box(14.2, 0.35, 9.2, green, 0, 5.15, -2));
  for (const [x, z] of [[-5.5, 1], [5.5, 1], [-5.5, -5], [5.5, -5]]) g.add(box(0.4, 5, 0.4, white, x, 2.7, z));
  for (const x of [-2.5, 2.5]) { g.add(box(0.9, 1.7, 0.6, white, x, 1.05, -2)); g.add(box(0.92, 0.35, 0.62, green, x, 1.6, -2)); }
  const board = new Mesh(new PlaneGeometry(2.2, 3), label('OGA PETROL', '#1e8a46', '#ffffff', 256, 340));
  const post = box(0.25, 5, 0.25, m('#555a5e', { metalness: 0.5 }), 7.6, 2.5, 1.5);
  board.position.set(7.6, 5.4, 1.65); g.add(post); g.add(board);
  return g;
}

/** A church behind railings: a yellow front with a tower and a sign. */
export function church(m: MatFn, name: string) {
  const g = new Group(), yellow = m('#f2c94c', { shadow: true }), trim = m('#a67c2e');
  g.add(box(13, 9, 10, yellow, -1, 4.5, -6.5));
  g.add(box(3.2, 15, 3.2, yellow, 6.5, 7.5, -3));
  g.add(box(3.6, 0.4, 3.6, trim, 6.5, 15.2, -3));
  g.add(box(13.4, 0.4, 10.4, trim, -1, 9.1, -6.5));
  for (let i = 0; i < 4; i++) g.add(box(1.4, 2.6, 0.1, m('#5b3a1e'), -6 + i * 3.4, 4.6, -1.45));
  const sign = new Mesh(new PlaneGeometry(9, 1.2), label(name, '#ffffff', '#1b3a8a'));
  sign.position.set(-1, 7.2, -1.44); g.add(sign);
  // Low wall with railings along the pavement edge.
  g.add(box(18, 0.8, 0.3, yellow, 0, 0.4, 0));
  const bars = m('#3d3d3d', { metalness: 0.4 });
  g.add(box(18, 0.06, 0.06, bars, 0, 1.9, 0));
  for (let x = -8.8; x <= 8.8; x += 0.6) g.add(box(0.05, 1.1, 0.05, bars, x, 1.35, 0));
  return g;
}

/** A green direction sign over the road on two posts (width = distance between the posts). */
export function directionSign(m: MatFn, text: string, width: number) {
  const g = new Group(), post = m('#6b6f73', { metalness: 0.6, roughness: 0.4 });
  [-1, 1].forEach(s => g.add(box(0.35, 6.6, 0.35, post, s * width / 2, 3.3, 0)));
  g.add(box(width, 0.2, 0.2, post, 0, 6.4, 0));
  const board = new Mesh(new PlaneGeometry(Math.min(width - 1, 11), 1.9), label(text, '#1f6e3d', '#ffffff'));
  board.position.set(0, 5.6, 0.13); g.add(board);
  const back = board.clone(); back.rotation.y = Math.PI; back.position.z = -0.13; g.add(back);
  return g;
}

/** A parked okada, about 1.9 m long, facing along the road. */
export function parkedOkada(m: MatFn, r: () => number) {
  const g = new Group(), tyre = m('#161616', { roughness: 0.9 }), body = m(r() < 0.6 ? '#c62828' : '#1b1b1b', { roughness: 0.4, metalness: 0.2 });
  g.add(box(1.1, 0.35, 0.3, body, 0, 0.62, 0));
  g.add(box(0.7, 0.12, 0.32, m('#2a2a2a'), -0.2, 0.86, 0));
  g.add(box(0.06, 0.06, 0.7, m('#9e9e9e', { metalness: 0.6 }), 0.55, 1.0, 0));
  [-0.68, 0.68].forEach(x => { const w = new Mesh(new CylinderGeometry(0.3, 0.3, 0.12, 10), tyre); w.rotation.x = Math.PI / 2; w.position.set(x, 0.3, 0); g.add(w); });
  return g;
}

/**
 * A roundabout island: a kerbed disc with a plinth, a stone figure with one arm raised, and a blue
 * direction-arrow plate. Centred on the origin, ground at y = 0.
 */
export function statueIsland(m: MatFn, radius: number) {
  const g = new Group(), stone = m('#b9b3a6', { roughness: 0.9, shadow: true });
  const kerb = new Mesh(new CylinderGeometry(radius, radius + 0.1, 0.32, 24), m('#c9c7c0', { roughness: 0.95 }));
  kerb.position.y = 0.16; g.add(kerb);
  const top = new Mesh(new CylinderGeometry(radius - 0.35, radius - 0.35, 0.06, 24), m('#6f8f45', { roughness: 1 }));
  top.position.y = 0.33; g.add(top);
  g.add(box(2.2, 0.5, 2.2, stone, 0, 0.6, 0));
  g.add(box(1.5, 2.2, 1.5, stone, 0, 1.95, 0));
  const body = new Mesh(new CylinderGeometry(0.28, 0.4, 1.6, 10), stone); body.position.y = 3.85; g.add(body);
  const head = new Mesh(new CylinderGeometry(0.26, 0.26, 0.4, 10), stone); head.position.y = 4.85; g.add(head);
  const arm = box(0.2, 0.9, 0.2, stone, 0.45, 4.5, 0); arm.rotation.z = -0.5; g.add(arm);
  const arrow = new Mesh(new PlaneGeometry(1.6, 1.0), new MeshStandardMaterial({
    roughness: 0.6, map: canvasTex(128, 80, (x, w, h) => {
      x.fillStyle = '#1f5fb0'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#ffffff'; x.beginPath(); x.moveTo(w * 0.2, h * 0.5); x.lineTo(w * 0.55, h * 0.15); x.lineTo(w * 0.55, h * 0.38); x.lineTo(w * 0.85, h * 0.38);
      x.lineTo(w * 0.85, h * 0.62); x.lineTo(w * 0.55, h * 0.62); x.lineTo(w * 0.55, h * 0.85); x.closePath(); x.fill();
    }),
  }));
  arrow.position.set(0, 1.2, radius - 0.9); g.add(box(0.12, 1.9, 0.12, m('#555a5e', { metalness: 0.5 }), 0, 0.95, radius - 0.95)); arrow.position.y = 1.8; g.add(arrow);
  return g;
}
