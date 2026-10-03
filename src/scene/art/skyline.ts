import { CanvasTexture, CylinderGeometry, DoubleSide, Mesh, MeshBasicMaterial, RepeatWrapping, SRGBColorSpace } from 'three';
import { rng } from '../trackGeometry';

/**
 * A painted Lagos skyline wrapped around the horizon, the way Beach Buggy paints its far
 * mountains: a hazy back row of towers, then a dense band of low-rise roofs with water tanks,
 * a mosque dome and minaret, a church spire, telecom masts, cranes and palms. Costs one draw call.
 */
function paint(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d')!, r = rng(77);
  const base = h * 0.98;

  // Back row: hazy towers (Lagos Island / VI in the distance).
  x.fillStyle = '#b9c3cc';
  for (let px = 0; px < w;) {
    const bw = 30 + r() * 70, bh = h * (0.25 + r() * 0.45);
    x.fillRect(px, base - bh, bw, bh);
    if (r() < 0.3) { x.fillRect(px + bw * 0.45, base - bh - 30, 4, 30); }
    px += bw + r() * 60;
  }
  // Windows twinkle faintly in the haze.
  x.fillStyle = 'rgba(255,255,255,.18)';
  for (let i = 0; i < 900; i++) x.fillRect(r() * w, base - r() * h * 0.6, 3, 4);

  // Middle row: dense low-rise with roofs, tanks and dishes.
  const mid = ['#a99a8a', '#b5a493', '#9c8e80', '#b8a99b', '#a5978c'];
  for (let px = 0; px < w;) {
    const bw = 40 + r() * 90, bh = h * (0.12 + r() * 0.2);
    x.fillStyle = mid[Math.floor(r() * mid.length)];
    x.fillRect(px, base - bh, bw, bh);
    if (r() < 0.45) { x.fillStyle = '#7b5b45'; x.beginPath(); x.moveTo(px - 6, base - bh); x.lineTo(px + bw / 2, base - bh - 18 - r() * 10); x.lineTo(px + bw + 6, base - bh); x.fill(); }
    else { x.fillStyle = '#2b2b2b'; for (let k = 0; k < 1 + r() * 2; k++) x.fillRect(px + 8 + r() * (bw - 20), base - bh - 12, 10, 12); }
    x.fillStyle = 'rgba(60,50,40,.25)'; for (let k = 0; k < bw / 14; k++) x.fillRect(px + 4 + k * 14, base - bh + 8 + (k % 2) * 14, 7, 8);
    px += bw + r() * 6;
  }
  // Landmarks: mosque, church spire, telecom masts, cranes.
  for (let i = 0; i < 3; i++) {
    const mx = (i + 0.2 + r() * 0.5) * w / 3, mb = base - h * 0.22;
    x.fillStyle = '#8fae9a'; x.beginPath(); x.arc(mx, mb, 30, Math.PI, 0); x.fill();
    x.fillStyle = '#d9d2c4'; x.fillRect(mx - 34, mb, 68, h * 0.22);
    x.fillRect(mx + 46, mb - 70, 9, 70 + h * 0.22); x.fillStyle = '#8fae9a'; x.beginPath(); x.moveTo(mx + 43, mb - 70); x.lineTo(mx + 50.5, mb - 88); x.lineTo(mx + 58, mb - 70); x.fill();
    const cxp = (i + 0.7) * w / 3; x.fillStyle = '#c9b9a6'; x.fillRect(cxp, base - h * 0.42, 16, h * 0.42);
    x.beginPath(); x.moveTo(cxp - 2, base - h * 0.42); x.lineTo(cxp + 8, base - h * 0.55); x.lineTo(cxp + 18, base - h * 0.42); x.fill();
    const tx = (i + 0.45) * w / 3; x.strokeStyle = '#8c8c8c'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(tx - 10, base); x.lineTo(tx, base - h * 0.62); x.lineTo(tx + 10, base); x.stroke();
    for (let k = 1; k < 9; k++) { const y = base - k * h * 0.07; x.beginPath(); x.moveTo(tx - 10 + k * 1.1, y); x.lineTo(tx + 10 - k * 1.1, y - h * 0.035); x.stroke(); }
    x.fillStyle = '#d0141a'; x.fillRect(tx - 2, base - h * 0.64, 4, 5);
  }
  for (let i = 0; i < 2; i++) {
    const kx = (i + 0.3) * w / 2; x.strokeStyle = '#d4a017'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(kx, base - h * 0.3); x.lineTo(kx, base - h * 0.8); x.lineTo(kx + 110, base - h * 0.8); x.moveTo(kx - 30, base - h * 0.8); x.lineTo(kx, base - h * 0.8); x.stroke();
    x.beginPath(); x.moveTo(kx + 90, base - h * 0.8); x.lineTo(kx + 90, base - h * 0.62); x.stroke();
  }
  // Front row: palms and billboards in silhouette.
  x.fillStyle = '#6f7d63';
  for (let i = 0; i < 26; i++) {
    const px = r() * w, ph = h * (0.18 + r() * 0.16);
    x.fillRect(px, base - ph, 3, ph);
    for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; x.beginPath(); x.ellipse(px + Math.cos(a) * 12, base - ph + Math.sin(a) * 5 + 3, 15, 3.5, a, 0, 7); x.fill(); }
  }
  // Warm haze over the whole band, thicker low down.
  const haze = x.createLinearGradient(0, 0, 0, h);
  haze.addColorStop(0, 'rgba(240,226,200,0)'); haze.addColorStop(0.6, 'rgba(240,226,200,.25)'); haze.addColorStop(1, 'rgba(240,226,200,.6)');
  x.globalCompositeOperation = 'source-atop'; x.fillStyle = haze; x.fillRect(0, 0, w, h); x.globalCompositeOperation = 'source-over';
  return c;
}

export function makeSkyline(cx: number, cz: number, radius: number, height = 70) {
  const t = new CanvasTexture(paint(2048, 256));
  t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  t.repeat.set(3, 1);
  const m = new Mesh(new CylinderGeometry(radius, radius, height, 64, 1, true), new MeshBasicMaterial({ map: t, alphaTest: 0.4, side: DoubleSide, fog: false, depthWrite: false }));
  m.position.set(cx, height / 2 - 3, cz);
  m.renderOrder = -1;
  return m;
}
