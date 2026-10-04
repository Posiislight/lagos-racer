import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';
import type { ItemKind } from '../../game/runtime';

/**
 * Item icons, drawn once and shared by the pickups on the road and the HUD, so what you see
 * floating ahead is exactly what you get:
 * - fuel: a yellow jerrycan with a flame (speed boost),
 * - oil: a black crude oil drum, dripping (makes whoever hits it slippery),
 * - juju: a calabash tied with red cloth and cowries, glowing purple (slows the racer ahead),
 * - odeshi: a leather-wrapped amulet on a red cord with cowries, glowing blue (blocks oil and juju).
 */
export const ITEM_COLOR: Record<ItemKind, string> = { fuel: '#ff9f1a', oil: '#2fd3c7', juju: '#b04dff', odeshi: '#37b6ff' };
export const ITEM_KINDS: ItemKind[] = ['fuel', 'oil', 'juju', 'odeshi'];

const S = 256;
type Ctx = CanvasRenderingContext2D;

function badge(x: Ctx, ring: string) {
  const g = x.createRadialGradient(S / 2, S / 2, S * 0.2, S / 2, S / 2, S * 0.5);
  g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.8, 'rgba(255,248,235,.95)'); g.addColorStop(1, 'rgba(255,248,235,0)');
  x.fillStyle = g; x.beginPath(); x.arc(S / 2, S / 2, S * 0.47, 0, 7); x.fill();
  x.lineWidth = 14; x.strokeStyle = ring; x.beginPath(); x.arc(S / 2, S / 2, S * 0.43, 0, 7); x.stroke();
  x.lineWidth = 4; x.strokeStyle = '#231f1b'; x.beginPath(); x.arc(S / 2, S / 2, S * 0.465, 0, 7); x.stroke();
}

function fuel(x: Ctx) {
  badge(x, ITEM_COLOR.fuel);
  // Jerrycan body.
  x.save(); x.translate(S / 2, S / 2 + 10); x.rotate(-0.12);
  x.fillStyle = '#f5b400'; x.strokeStyle = '#231f1b'; x.lineWidth = 6;
  x.beginPath(); x.moveTo(-50, -60); x.lineTo(30, -60); x.lineTo(55, -35); x.lineTo(55, 62); x.lineTo(-50, 62); x.closePath(); x.fill(); x.stroke();
  x.fillStyle = '#d99600'; x.fillRect(-36, -22, 76, 10); x.fillRect(-36, 10, 76, 10);                 // ribs
  x.fillStyle = '#231f1b'; x.fillRect(-44, -82, 34, 22);                                               // handle
  x.fillStyle = '#f5b400'; x.fillRect(-38, -76, 22, 12);
  x.fillStyle = '#c62828'; x.beginPath(); x.roundRect(20, -84, 24, 26, 5); x.fill(); x.stroke();         // red cap
  x.fillStyle = '#231f1b'; x.font = '900 26px Archivo, Arial'; x.textAlign = 'center'; x.fillText('FUEL', 2, 50);
  x.restore();
  // Flame for speed.
  x.fillStyle = '#ff5722';
  x.beginPath(); x.moveTo(178, 192); x.quadraticCurveTo(232, 150, 196, 96); x.quadraticCurveTo(206, 140, 176, 150); x.quadraticCurveTo(184, 120, 160, 104); x.quadraticCurveTo(170, 160, 150, 182); x.closePath(); x.fill();
  x.fillStyle = '#ffd54f'; x.beginPath(); x.moveTo(176, 188); x.quadraticCurveTo(204, 160, 188, 128); x.quadraticCurveTo(186, 158, 168, 166); x.closePath(); x.fill();
}

function oil(x: Ctx) {
  badge(x, ITEM_COLOR.oil);
  x.save(); x.translate(S / 2, S / 2);
  // Drum.
  const g = x.createLinearGradient(-55, 0, 55, 0);
  g.addColorStop(0, '#111'); g.addColorStop(0.35, '#3a3a3a'); g.addColorStop(0.6, '#1b1b1b'); g.addColorStop(1, '#0a0a0a');
  x.fillStyle = g; x.strokeStyle = '#231f1b'; x.lineWidth = 6;
  x.beginPath(); x.roundRect(-55, -70, 110, 140, 14); x.fill(); x.stroke();
  x.fillStyle = '#555'; x.fillRect(-55, -28, 110, 8); x.fillRect(-55, 24, 110, 8);
  x.fillStyle = '#2fd3c7'; x.font = '900 22px Archivo, Arial'; x.textAlign = 'center'; x.fillText('CRUDE', 0, 10);
  // Spill.
  x.fillStyle = '#0d0d0d';
  x.beginPath(); x.ellipse(10, 82, 82, 18, 0, 0, 7); x.fill();
  x.fillStyle = 'rgba(140,110,255,.45)'; x.beginPath(); x.ellipse(-12, 78, 30, 6, 0, 0, 7); x.fill();
  x.fillStyle = '#0d0d0d'; x.beginPath(); x.moveTo(40, -70); x.quadraticCurveTo(52, -40, 40, -30); x.quadraticCurveTo(30, -40, 40, -70); x.fill();
  x.restore();
}

function juju(x: Ctx) {
  badge(x, ITEM_COLOR.juju);
  const glow = x.createRadialGradient(S / 2, S / 2 + 6, 10, S / 2, S / 2 + 6, 90);
  glow.addColorStop(0, 'rgba(176,77,255,.75)'); glow.addColorStop(1, 'rgba(176,77,255,0)');
  x.fillStyle = glow; x.beginPath(); x.arc(S / 2, S / 2 + 6, 92, 0, 7); x.fill();
  x.save(); x.translate(S / 2, S / 2 + 18);
  // Calabash gourd.
  x.fillStyle = '#c98a3a'; x.strokeStyle = '#231f1b'; x.lineWidth = 6;
  x.beginPath(); x.ellipse(0, 18, 58, 50, 0, 0, 7); x.fill(); x.stroke();
  x.beginPath(); x.ellipse(0, -46, 26, 24, 0, 0, 7); x.fill(); x.stroke();
  x.fillStyle = '#8d5a24'; x.beginPath(); x.ellipse(-18, 10, 12, 30, 0.2, 0, 7); x.fill();
  // Red cloth tied at the neck, with cowries.
  x.fillStyle = '#d81b1b'; x.beginPath(); x.moveTo(-30, -30); x.lineTo(30, -30); x.lineTo(38, -12); x.lineTo(-38, -12); x.closePath(); x.fill(); x.stroke();
  x.beginPath(); x.moveTo(30, -22); x.lineTo(58, -8); x.lineTo(46, 6); x.closePath(); x.fill(); x.stroke();
  for (const [cx, cy] of [[-22, 30], [0, 40], [22, 30]]) {
    x.fillStyle = '#fff6e0'; x.beginPath(); x.ellipse(cx, cy, 9, 13, 0, 0, 7); x.fill(); x.lineWidth = 3; x.stroke();
    x.beginPath(); x.moveTo(cx, cy - 8); x.lineTo(cx, cy + 8); x.stroke();
  }
  x.restore();
  // Two glowing eyes: it means business.
  x.fillStyle = '#f3e5ff';
  x.beginPath(); x.ellipse(S / 2 - 16, S / 2 + 30, 8, 5, 0, 0, 7); x.ellipse(S / 2 + 16, S / 2 + 30, 8, 5, 0, 0, 7); x.fill();
}

function odeshi(x: Ctx) {
  badge(x, ITEM_COLOR.odeshi);
  const glow = x.createRadialGradient(S / 2, S / 2, 10, S / 2, S / 2, 92);
  glow.addColorStop(0, 'rgba(55,182,255,.7)'); glow.addColorStop(1, 'rgba(55,182,255,0)');
  x.fillStyle = glow; x.beginPath(); x.arc(S / 2, S / 2, 94, 0, 7); x.fill();
  x.save(); x.translate(S / 2, S / 2 + 6);
  // Red cord looped over the top.
  x.strokeStyle = '#d81b1b'; x.lineWidth = 9; x.lineCap = 'round';
  x.beginPath(); x.moveTo(-26, -34); x.quadraticCurveTo(-32, -92, 0, -92); x.quadraticCurveTo(32, -92, 26, -34); x.stroke();
  // Leather-wrapped amulet, bound with bands.
  x.fillStyle = '#8d5a24'; x.strokeStyle = '#231f1b'; x.lineWidth = 6;
  x.beginPath(); x.moveTo(0, -48); x.quadraticCurveTo(46, -42, 46, 0); x.quadraticCurveTo(46, 40, 0, 56); x.quadraticCurveTo(-46, 40, -46, 0); x.quadraticCurveTo(-46, -42, 0, -48); x.closePath(); x.fill(); x.stroke();
  x.fillStyle = '#c98a3a';
  x.beginPath(); x.ellipse(-14, -4, 10, 28, 0.15, 0, 7); x.fill();
  x.strokeStyle = '#231f1b'; x.lineWidth = 4;
  for (const y of [-22, 0, 22]) { x.beginPath(); x.moveTo(-44, y); x.quadraticCurveTo(0, y + 10, 44, y); x.stroke(); }
  // Cowries across the middle band.
  for (const cx of [-24, 0, 24]) {
    x.fillStyle = '#fff6e0'; x.lineWidth = 3; x.beginPath(); x.ellipse(cx, 2, 8, 11, 0, 0, 7); x.fill(); x.stroke();
    x.beginPath(); x.moveTo(cx, -4); x.lineTo(cx, 8); x.stroke();
  }
  x.restore();
}

const PAINT: Record<ItemKind, (x: Ctx) => void> = { fuel, oil, juju, odeshi };

function canvasFor(kind: ItemKind) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  PAINT[kind](c.getContext('2d')!);
  return c;
}

/** Data URLs for the HUD and touch buttons. */
export const ITEM_ICON: Record<ItemKind, string> = typeof document === 'undefined'
  ? { fuel: '', oil: '', juju: '', odeshi: '' }
  : Object.fromEntries(ITEM_KINDS.map(k => [k, canvasFor(k).toDataURL()])) as Record<ItemKind, string>;

let atlas: Texture | null = null;
/** All four icons side by side (cells 0..3) for the pickups on the road. */
export function itemAtlas(): Texture {
  if (atlas) return atlas;
  const c = document.createElement('canvas');
  c.width = S * 4; c.height = S;
  const x = c.getContext('2d')!;
  ITEM_KINDS.forEach((k, i) => x.drawImage(canvasFor(k), i * S, 0));
  atlas = new CanvasTexture(c);
  atlas.colorSpace = SRGBColorSpace;
  atlas.anisotropy = 4;
  return atlas;
}
