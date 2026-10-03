import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import { rng } from '../trackGeometry';

function tex(w: number, h: number, draw: (x: CanvasRenderingContext2D, w: number, h: number) => void, repeat = true): Texture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/**
 * Pavement strip beside the barrier: U runs outwards from the road, V along it. A covered
 * concrete drainage gutter first (the open gutters Lagos is known for), then cracked paving
 * slabs with dirt and stains.
 */
export function pavementTexture() {
  return tex(256, 256, (x, w, h) => {
    const r = rng(21);
    x.fillStyle = '#c9c0b0'; x.fillRect(0, 0, w, h);
    // Paving slabs.
    x.strokeStyle = 'rgba(80,70,60,.35)'; x.lineWidth = 2;
    for (let yy = 0; yy <= h; yy += 42) { x.beginPath(); x.moveTo(w * 0.16, yy); x.lineTo(w, yy); x.stroke(); }
    for (let xx = w * 0.16; xx <= w; xx += 42) { x.beginPath(); x.moveTo(xx, 0); x.lineTo(xx, h); x.stroke(); }
    for (let i = 0; i < 40; i++) { const sx = w * 0.16 + r() * w * 0.84, sy = r() * h; x.fillStyle = `rgba(${90 + r() * 40},${70 + r() * 30},${50},${0.08 + r() * 0.14})`; x.beginPath(); x.ellipse(sx, sy, 6 + r() * 20, 4 + r() * 12, r() * 3, 0, 7); x.fill(); }
    x.strokeStyle = 'rgba(60,50,40,.4)'; x.lineWidth = 1;
    for (let i = 0; i < 14; i++) { let px = w * 0.2 + r() * w * 0.75, py = r() * h; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 4; k++) { px += (r() - 0.5) * 18; py += r() * 14; x.lineTo(px, py); } x.stroke(); }
    // Laterite dust drifting onto the outer edge.
    const g = x.createLinearGradient(w * 0.7, 0, w, 0); g.addColorStop(0, 'rgba(168,125,92,0)'); g.addColorStop(1, 'rgba(168,125,92,.75)');
    x.fillStyle = g; x.fillRect(w * 0.7, 0, w * 0.3, h);
    // Gutter: dark channel with concrete slab covers, some missing.
    x.fillStyle = '#5b5650'; x.fillRect(0, 0, w * 0.16, h);
    for (let yy = 0; yy < h; yy += 32) {
      if (r() < 0.2) { x.fillStyle = '#2a2622'; x.fillRect(4, yy + 2, w * 0.16 - 8, 28); x.fillStyle = 'rgba(60,90,70,.6)'; x.fillRect(6, yy + 18, w * 0.16 - 12, 8); continue; }
      x.fillStyle = '#9a948a'; x.fillRect(3, yy + 2, w * 0.16 - 6, 28);
      x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(3, yy + 28, w * 0.16 - 6, 2);
    }
  });
}

/** Rusty corrugated zinc for pitched roofs and awnings. */
export function zincTexture() {
  return tex(256, 256, (x, w, h) => {
    const r = rng(33);
    for (let xx = 0; xx < w; xx += 8) {
      const g = x.createLinearGradient(xx, 0, xx + 8, 0);
      g.addColorStop(0, '#8b6f5a'); g.addColorStop(0.5, '#b39880'); g.addColorStop(1, '#7a604c');
      x.fillStyle = g; x.fillRect(xx, 0, 8, h);
    }
    for (let i = 0; i < 30; i++) { x.fillStyle = `rgba(${120 + r() * 50},${55 + r() * 20},${25},${0.25 + r() * 0.4})`; x.beginPath(); x.ellipse(r() * w, r() * h, 8 + r() * 30, 6 + r() * 26, r() * 3, 0, 7); x.fill(); }
    x.fillStyle = 'rgba(0,0,0,.2)'; for (let yy = 0; yy < h; yy += 64) x.fillRect(0, yy, w, 3);
  });
}

/** A rail of clothes for sale: shirts, dresses, jeans and ankara, with gaps between (alpha). */
export function clothesTexture() {
  return tex(512, 128, (x, w, h) => {
    const r = rng(44);
    const cols = ['#d81b60', '#1e88e5', '#fdd835', '#43a047', '#ff7043', '#8e24aa', '#ffffff', '#3949ab', '#00897b', '#f4511e', '#212121'];
    x.clearRect(0, 0, w, h);
    x.fillStyle = '#9e9e9e'; x.fillRect(0, 2, w, 4);
    for (let px = 4; px < w - 30;) {
      const c = cols[Math.floor(r() * cols.length)], kind = r(), cw = 26 + r() * 16;
      x.fillStyle = c;
      if (kind < 0.4) { x.beginPath(); x.moveTo(px + 6, 8); x.lineTo(px + cw - 6, 8); x.lineTo(px + cw + 4, 22); x.lineTo(px + cw - 4, 28); x.lineTo(px + cw - 6, 70); x.lineTo(px + 6, 70); x.lineTo(px + 4, 28); x.lineTo(px - 4, 22); x.fill(); }
      else if (kind < 0.7) { x.beginPath(); x.moveTo(px + 8, 8); x.lineTo(px + cw - 8, 8); x.lineTo(px + cw + 4, 110); x.lineTo(px - 4, 110); x.fill(); if (r() < 0.6) { x.fillStyle = cols[Math.floor(r() * cols.length)]; for (let yy = 20; yy < 108; yy += 12) for (let xx = px; xx < px + cw; xx += 10) { x.beginPath(); x.arc(xx + (yy % 24) / 2, yy, 3, 0, 7); x.fill(); } } }
      else { x.fillStyle = '#2b4c7e'; x.fillRect(px + 4, 8, cw - 8, 18); x.fillRect(px + 4, 26, (cw - 10) / 2, 80); x.fillRect(px + cw / 2 + 1, 26, (cw - 10) / 2, 80); }
      x.fillStyle = 'rgba(0,0,0,.12)'; x.fillRect(px + cw / 2, 10, 2, 60);
      px += cw + 2 + r() * 6;
    }
  }, false);
}
