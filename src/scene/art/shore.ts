import { CanvasTexture, CylinderGeometry, DoubleSide, Mesh, MeshBasicMaterial, RepeatWrapping, SRGBColorSpace } from 'three';
import { rng } from '../trackGeometry';

/**
 * The far shore across the lagoon, painted round the horizon: a hazy cluster of Lagos Island towers
 * with a long dark line of mangrove in front, melting into the haze. One draw call, like the street skyline.
 */
function paint(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d')!, r = rng(52);
  const base = h * 0.98;
  // Clusters of towers, thin and pale, with gaps of open shore between them.
  for (let cluster = 0; cluster < 5; cluster++) {
    const cx = ((cluster + 0.3 + r() * 0.4) / 5) * w, count = 5 + Math.floor(r() * 7);
    for (let i = 0; i < count; i++) {
      const bw = 14 + r() * 26, bh = h * (0.25 + r() * 0.5), bx = cx + (i - count / 2) * 24 + r() * 10;
      x.fillStyle = ['#a9bccb', '#b6c7d4', '#9fb3c4'][Math.floor(r() * 3)];
      x.fillRect(bx, base - bh, bw, bh);
      x.fillStyle = 'rgba(255,255,255,.22)';
      for (let k = 0; k < bh / 9; k++) x.fillRect(bx + 3, base - bh + 4 + k * 9, bw - 6, 2);
      if (r() < 0.3) { x.fillStyle = '#9fb3c4'; x.fillRect(bx + bw / 2 - 1, base - bh - 18, 2, 18); }
    }
  }
  // Mangrove and palms along the water line.
  x.fillStyle = '#5f8160';
  x.beginPath(); x.moveTo(0, h);
  for (let px = 0; px <= w; px += 6) x.lineTo(px, base - h * (0.07 + 0.05 * Math.sin(px * 0.021) + 0.03 * Math.sin(px * 0.057 + 1) + r() * 0.025));
  x.lineTo(w, h); x.fill();
  x.fillStyle = '#4d6f50';
  for (let i = 0; i < 30; i++) {
    const px = r() * w, ph = h * (0.14 + r() * 0.14);
    x.fillRect(px, base - ph, 3, ph);
    for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; x.beginPath(); x.ellipse(px + Math.cos(a) * 11, base - ph + Math.sin(a) * 5 + 3, 14, 3.5, a, 0, 7); x.fill(); }
  }
  // Haze over everything, thicker towards the water.
  const haze = x.createLinearGradient(0, 0, 0, h);
  haze.addColorStop(0, 'rgba(225,238,246,.1)'); haze.addColorStop(0.55, 'rgba(225,238,246,.4)'); haze.addColorStop(1, 'rgba(225,238,246,.8)');
  x.globalCompositeOperation = 'source-atop'; x.fillStyle = haze; x.fillRect(0, 0, w, h); x.globalCompositeOperation = 'source-over';
  return c;
}

export function makeShore(cx: number, cz: number, radius: number, height = 70) {
  const t = new CanvasTexture(paint(2048, 256));
  t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  t.repeat.set(3, 1);
  const m = new Mesh(new CylinderGeometry(radius, radius, height, 64, 1, true), new MeshBasicMaterial({ map: t, alphaTest: 0.4, side: DoubleSide, fog: false, depthWrite: false }));
  m.position.set(cx, height / 2 - 3, cz);
  m.renderOrder = -1;
  return m;
}
