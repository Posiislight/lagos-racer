import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';
import { rng } from '../trackGeometry';

/**
 * Hand-painted building fronts in one 1024×1024 atlas (2×2 cells of 512×512), based on the
 * Ojuelegba Road reference: weathered three-storey concrete blocks with louvre windows, burglar
 * bars and AC units; older two-storey houses with balconies; a newer glass-and-cladding plaza;
 * and a one-storey row of open shopfronts. The detail lives in the paint so the geometry can stay
 * a simple box. Walls are painted light so a per-building tint can recolour them.
 */
export type FacadeKind = 'concrete' | 'house' | 'plaza' | 'shops';
export const FACADES: Record<FacadeKind, { cell: number; floors: number; width: number; height: number }> = {
  concrete: { cell: 0, floors: 3, width: 11, height: 10.5 },
  house: { cell: 1, floors: 2, width: 10.5, height: 7.4 },
  plaza: { cell: 2, floors: 4, width: 13, height: 13.5 },
  shops: { cell: 3, floors: 1, width: 12, height: 4.6 },
};
/** Fraction of a cell's width at its left edge that is plain wall (used for the building's sides). */
export const SIDE_STRIP = 0.07;

type Ctx = CanvasRenderingContext2D;
const C = 512;

const GOODS = ['#d81b60', '#1e88e5', '#fdd835', '#43a047', '#ff7043', '#8e24aa', '#ffffff', '#3949ab', '#00897b', '#f4511e', '#6d4c41', '#c0ca33'];

/** Rain streaks and grime running down from an edge: the look of Lagos concrete after rainy season. */
function grime(x: Ctx, X: number, Y: number, W: number, H: number, r: () => number, amount = 1) {
  for (let i = 0; i < 26 * amount; i++) {
    const sx = X + r() * W, len = H * (0.15 + r() * 0.6), w = 3 + r() * 10, y0 = Y + r() * H * 0.5;
    const g = x.createLinearGradient(0, y0, 0, y0 + len);
    g.addColorStop(0, `rgba(60,55,45,${0.12 + r() * 0.16})`); g.addColorStop(1, 'rgba(60,55,45,0)');
    x.fillStyle = g; x.fillRect(sx, y0, w, len);
  }
  for (let i = 0; i < 14 * amount; i++) {
    x.fillStyle = `rgba(${70 + r() * 40},${60 + r() * 30},${45 + r() * 20},${0.05 + r() * 0.1})`;
    x.beginPath(); x.ellipse(X + r() * W, Y + r() * H, 10 + r() * 40, 6 + r() * 26, r() * 3, 0, 7); x.fill();
  }
}

function louvreWindow(x: Ctx, X: number, Y: number, W: number, H: number, r: () => number, bars = true) {
  x.fillStyle = '#d9dcdc'; x.fillRect(X - 3, Y - 3, W + 6, H + 6);                    // frame
  const g = x.createLinearGradient(X, Y, X + W, Y + H);
  g.addColorStop(0, '#5d7480'); g.addColorStop(1, '#2f3f48');
  x.fillStyle = g; x.fillRect(X, Y, W, H);
  x.fillStyle = 'rgba(255,255,255,.22)';
  for (let yy = Y + 4; yy < Y + H; yy += 7) x.fillRect(X, yy, W, 2);                  // louvre blades
  x.fillStyle = '#c7cbcb'; x.fillRect(X + W / 2 - 1.5, Y, 3, H);                       // mullion
  if (r() < 0.35) { x.fillStyle = GOODS[Math.floor(r() * GOODS.length)]; x.globalAlpha = 0.75; x.fillRect(X + 2, Y + 2, W * (0.3 + r() * 0.3), H - 4); x.globalAlpha = 1; } // curtain
  if (bars) {
    x.strokeStyle = '#3a2a20'; x.lineWidth = 2.2;
    for (let xx = X + 6; xx < X + W; xx += 9) { x.beginPath(); x.moveTo(xx, Y - 2); x.lineTo(xx, Y + H + 2); x.stroke(); }
    x.beginPath(); x.moveTo(X - 2, Y + H * 0.5); x.lineTo(X + W + 2, Y + H * 0.5); x.stroke();
    x.strokeRect(X - 2, Y - 2, W + 4, H + 4);
  }
  // Rust drip from the burglar bars.
  const d = x.createLinearGradient(0, Y + H, 0, Y + H + 30);
  d.addColorStop(0, 'rgba(120,70,30,.35)'); d.addColorStop(1, 'rgba(120,70,30,0)');
  x.fillStyle = d; x.fillRect(X + W * 0.2, Y + H + 3, W * 0.6, 30);
}

function acUnit(x: Ctx, X: number, Y: number) {
  x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(X + 3, Y + 4, 34, 24);
  x.fillStyle = '#e7e7e2'; x.fillRect(X, Y, 34, 24);
  x.strokeStyle = '#9a9a96'; x.lineWidth = 1;
  for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(X + 3, Y + 4 + i * 3.4); x.lineTo(X + 20, Y + 4 + i * 3.4); x.stroke(); }
  x.beginPath(); x.arc(X + 27, Y + 12, 6, 0, 7); x.stroke();
  const d = x.createLinearGradient(0, Y + 24, 0, Y + 60); d.addColorStop(0, 'rgba(50,60,60,.3)'); d.addColorStop(1, 'rgba(50,60,60,0)');
  x.fillStyle = d; x.fillRect(X + 24, Y + 24, 4, 36);                                   // drip stain
}

/** Ground-floor shop opening with clothes and goods hanging in a dark interior. */
function shopOpening(x: Ctx, X: number, Y: number, W: number, H: number, r: () => number, shutter: string) {
  x.fillStyle = '#231c17'; x.fillRect(X, Y, W, H);
  const g = x.createLinearGradient(0, Y, 0, Y + H); g.addColorStop(0, 'rgba(0,0,0,.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  // Shutter rolled up at the top.
  x.fillStyle = shutter; x.fillRect(X, Y, W, H * 0.14);
  x.fillStyle = 'rgba(0,0,0,.25)'; for (let yy = Y + 3; yy < Y + H * 0.14; yy += 4) x.fillRect(X, yy, W, 1.2);
  // Rail with hanging clothes.
  x.fillStyle = '#888'; x.fillRect(X + 2, Y + H * 0.2, W - 4, 2);
  for (let xx = X + 4; xx < X + W - 8; xx += 7 + r() * 6) {
    const c = GOODS[Math.floor(r() * GOODS.length)], h = H * (0.3 + r() * 0.3), w = 8 + r() * 9;
    x.fillStyle = c; x.beginPath(); x.moveTo(xx, Y + H * 0.21); x.lineTo(xx + w, Y + H * 0.21); x.lineTo(xx + w + 2, Y + H * 0.21 + h); x.lineTo(xx - 2, Y + H * 0.21 + h); x.fill();
    x.fillStyle = 'rgba(255,255,255,.15)'; x.fillRect(xx + 1, Y + H * 0.22, 2, h - 4);
  }
  // Goods stacked on the floor: bags, buckets, boxes.
  for (let xx = X + 2; xx < X + W - 10; xx += 10 + r() * 8) {
    const h = 8 + r() * 16; x.fillStyle = GOODS[Math.floor(r() * GOODS.length)];
    x.fillRect(xx, Y + H - h, 9 + r() * 8, h);
  }
  x.fillStyle = g; x.fillRect(X, Y, W, H);
}

function signBand(x: Ctx, X: number, Y: number, W: number, H: number) {
  x.fillStyle = '#2c2a27'; x.fillRect(X, Y, W, H);                                      // blank band; 3D signs sit on top
  x.fillStyle = 'rgba(255,255,255,.08)'; x.fillRect(X, Y, W, 2);
}

function paintConcrete(x: Ctx, r: () => number) {
  x.fillStyle = '#e4ded2'; x.fillRect(0, 0, C, C);
  // Floor slab edges.
  const floorH = (C - 150) / 3;
  for (let f = 0; f < 3; f++) { x.fillStyle = 'rgba(0,0,0,.07)'; x.fillRect(0, 22 + f * floorH, C, 7); }
  x.fillStyle = '#d2cbbd'; x.fillRect(0, 0, C, 22);                                    // parapet
  grime(x, 0, 0, C, C - 150, r, 1.4);
  for (let f = 0; f < 3; f++) {
    const y = 40 + f * floorH;
    for (let b = 0; b < 4; b++) {
      const bx = 52 + b * 116;
      if (f === 1 && b === 3 && r() < 0.6) { x.fillStyle = '#6a5a4a'; x.fillRect(bx, y + 2, 44, floorH - 30); continue; } // stair window opening
      louvreWindow(x, bx, y + 6, 70, floorH - 46, r);
      if (r() < 0.55) acUnit(x, bx + 76, y + floorH - 70);
    }
  }
  // Ground floor shops behind pillars.
  const gy = C - 150;
  x.fillStyle = '#cfc7b8'; x.fillRect(0, gy, C, 150);
  signBand(x, 0, gy + 4, C, 26);
  for (let b = 0; b < 4; b++) shopOpening(x, 44 + b * 118, gy + 34, 104, 114, r, ['#5b7f5b', '#4a6d8c', '#8c4a4a', '#7a7a7a'][b]);
  grime(x, 0, gy, C, 150, r, 0.5);
  x.fillStyle = '#e4ded2'; x.fillRect(0, 0, C * SIDE_STRIP, C);                      // plain corner (side walls)
  grime(x, 0, 0, C * SIDE_STRIP, C, r, 0.4);
}

function paintHouse(x: Ctx, r: () => number) {
  x.fillStyle = '#f1e7cf'; x.fillRect(0, 0, C, C);
  grime(x, 0, 0, C, C, r, 1);
  // Peeling paint patches showing older colour underneath.
  for (let i = 0; i < 10; i++) { x.fillStyle = 'rgba(190,150,110,.35)'; x.beginPath(); x.ellipse(r() * C, r() * C * 0.55, 8 + r() * 22, 5 + r() * 12, r() * 3, 0, 7); x.fill(); }
  // Upper floor: wooden shutters and a balcony railing.
  for (let b = 0; b < 4; b++) {
    const bx = 50 + b * 116, y = 40;
    x.fillStyle = '#6b3f22'; x.fillRect(bx, y, 74, 130);
    x.fillStyle = '#7f4b29'; for (let yy = y + 6; yy < y + 128; yy += 8) x.fillRect(bx + 3, yy, 32, 5), x.fillRect(bx + 39, yy, 32, 5);
    x.fillStyle = '#efe9dc'; x.fillRect(bx - 5, y - 6, 84, 6);
  }
  x.fillStyle = '#d8d2c6'; x.fillRect(0, 200, C, 14);                                  // balcony slab edge
  x.fillStyle = '#f7f4ee';
  for (let xx = 8; xx < C; xx += 13) x.fillRect(xx, 214 - 60, 5, 60);                  // balusters
  x.fillRect(0, 150, C, 6);
  // Ground floor: shops with roller shutters, some half open.
  const gy = 250;
  x.fillStyle = '#e9dfc6'; x.fillRect(0, gy, C, C - gy);
  signBand(x, 0, gy + 6, C, 28);
  for (let b = 0; b < 4; b++) {
    const bx = 40 + b * 120, sh = ['#2e7d6b', '#3f5f9a', '#9a7a2e', '#7e3b3b'][b];
    shopOpening(x, bx, gy + 44, 104, 210, r, sh);
    if (r() < 0.5) { x.fillStyle = sh; x.fillRect(bx, gy + 44, 104, 120); x.fillStyle = 'rgba(0,0,0,.22)'; for (let yy = gy + 46; yy < gy + 164; yy += 5) x.fillRect(bx, yy, 104, 1.5); }
  }
  grime(x, 0, gy, C, C - gy, r, 0.6);
  x.fillStyle = '#f1e7cf'; x.fillRect(0, 0, C * SIDE_STRIP, C);
  grime(x, 0, 0, C * SIDE_STRIP, C, r, 0.3);
}

function paintPlaza(x: Ctx, r: () => number) {
  x.fillStyle = '#e8ecef'; x.fillRect(0, 0, C, C);
  // Cladding panels and blue glass bands.
  for (let f = 0; f < 3; f++) {
    const y = 30 + f * 96;
    const g = x.createLinearGradient(0, y, 0, y + 60); g.addColorStop(0, '#5aa0c8'); g.addColorStop(1, '#25607f');
    x.fillStyle = g; x.fillRect(36, y, C - 72, 60);
    x.fillStyle = 'rgba(255,255,255,.35)'; for (let xx = 36; xx < C - 36; xx += 44) x.fillRect(xx, y, 2, 60);
    x.fillStyle = 'rgba(255,255,255,.25)'; x.beginPath(); x.moveTo(60 + f * 40, y); x.lineTo(110 + f * 40, y); x.lineTo(80 + f * 40, y + 60); x.lineTo(30 + f * 40, y + 60); x.fill();
    x.fillStyle = '#c3ccd3'; x.fillRect(0, y + 64, C, 26);
    x.fillStyle = 'rgba(0,0,0,.08)'; for (let xx = 0; xx < C; xx += 64) x.fillRect(xx, y + 64, 2, 26);
  }
  grime(x, 0, 0, C, 330, r, 0.5);
  const gy = 330;
  signBand(x, 0, gy, C, 40);
  // Glass shopfronts with displays.
  for (let b = 0; b < 3; b++) {
    const bx = 30 + b * 160;
    x.fillStyle = '#20343f'; x.fillRect(bx, gy + 50, 140, 132);
    for (let i = 0; i < 6; i++) { x.fillStyle = GOODS[Math.floor(r() * GOODS.length)]; x.fillRect(bx + 10 + i * 21, gy + 120 + r() * 20, 15, 40); }
    x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(bx, gy + 50, 140, 6);
    x.fillStyle = 'rgba(255,255,255,.12)'; x.beginPath(); x.moveTo(bx + 20, gy + 50); x.lineTo(bx + 60, gy + 50); x.lineTo(bx + 30, gy + 182); x.lineTo(bx, gy + 182); x.fill();
    x.strokeStyle = '#b8c0c6'; x.lineWidth = 4; x.strokeRect(bx, gy + 50, 140, 132);
  }
  x.fillStyle = '#e8ecef'; x.fillRect(0, 0, C * SIDE_STRIP, C);
}

function paintShops(x: Ctx, r: () => number) {
  x.fillStyle = '#efe6d4'; x.fillRect(0, 0, C, C);
  // Hand-painted adverts on the upper wall.
  const ads = [['PHONE REPAIRS', '#1565c0'], ['BEST PRICE!', '#c62828'], ['POS • TRANSFER', '#2e7d32'], ['GENERATOR PARTS', '#6a1b9a']];
  for (let i = 0; i < 2; i++) {
    const [t, c] = ads[Math.floor(r() * ads.length)];
    x.fillStyle = c; x.fillRect(20 + i * 250, 30, 220, 90);
    x.fillStyle = '#fff'; x.font = '900 30px Archivo, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, 130 + i * 250, 75);
  }
  grime(x, 0, 0, C, 180, r, 0.8);
  // Corrugated awning painted at the top of the openings.
  x.fillStyle = '#9c8a74'; x.fillRect(0, 150, C, 30);
  x.fillStyle = 'rgba(0,0,0,.18)'; for (let xx = 0; xx < C; xx += 9) x.fillRect(xx, 150, 3, 30);
  x.fillStyle = 'rgba(140,70,30,.35)'; for (let i = 0; i < 8; i++) x.fillRect(r() * C, 150, 10 + r() * 30, 30);
  for (let b = 0; b < 4; b++) shopOpening(x, 14 + b * 125, 186, 112, 300, r, ['#4a6d8c', '#8c4a4a', '#5b7f5b', '#8c7a4a'][b]);
  x.fillStyle = '#d7cdb9'; x.fillRect(0, 486, C, 26);
  x.fillStyle = '#efe6d4'; x.fillRect(0, 0, C * SIDE_STRIP, C);
}

let atlas: Texture | null = null;

/** The shared facade atlas (painted once). */
export function facadeAtlas(): Texture {
  if (atlas) return atlas;
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const x = c.getContext('2d')!;
  const painters = [paintConcrete, paintHouse, paintPlaza, paintShops];
  painters.forEach((p, i) => {
    x.save(); x.translate((i % 2) * C, Math.floor(i / 2) * C); x.beginPath(); x.rect(0, 0, C, C); x.clip();
    p(x, rng(100 + i)); x.restore();
  });
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  atlas = t;
  return t;
}

/** UV rectangle [u0, v0, u1, v1] of a facade cell (v up, as three expects). */
export function cellUV(cell: number): [number, number, number, number] {
  const u0 = (cell % 2) * 0.5, v1 = 1 - Math.floor(cell / 2) * 0.5;
  return [u0, v1 - 0.5, u0 + 0.5, v1];
}
