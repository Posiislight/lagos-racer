import {
  CanvasTexture, DoubleSide, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry,
  Quaternion, SRGBColorSpace, Vector3, type Texture,
} from 'three';
import { rng } from '../trackGeometry';

/**
 * Flat cut-out characters (Beach Buggy style crowds): a sheet of hand-drawn Lagos people, drawn
 * as camera-facing cards that turn about their vertical axis. One draw call for the whole crowd.
 * Big heads and simple shapes to match the 3D characters.
 */
const COLS = 8, ROWS = 2, CW = 128, CH = 256;
const SKIN = ['#6a3a1e', '#43240f', '#8a5230', '#5a3018'];
const CLOTH = ['#d81b60', '#1e88e5', '#fdd835', '#43a047', '#ff7043', '#8e24aa', '#00897b', '#f4511e', '#3949ab'];

type Ctx = CanvasRenderingContext2D;

function ankara(x: Ctx, X: number, Y: number, W: number, H: number, a: string, b: string) {
  x.save(); x.beginPath(); x.rect(X, Y, W, H); x.clip();
  x.fillStyle = a; x.fillRect(X, Y, W, H);
  x.fillStyle = b;
  for (let yy = Y; yy < Y + H; yy += 12) for (let xx = X + ((yy / 12) % 2) * 6; xx < X + W; xx += 12) { x.beginPath(); x.arc(xx, yy, 3.5, 0, 7); x.fill(); }
  x.restore();
}

function head(x: Ctx, cx: number, cy: number, skin: string, r = 26) {
  x.fillStyle = skin; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
  x.beginPath(); x.arc(cx - r * 0.95, cy + 2, 6, 0, 7); x.arc(cx + r * 0.95, cy + 2, 6, 0, 7); x.fill();   // ears
  x.fillStyle = '#fff'; x.beginPath(); x.ellipse(cx - 9, cy - 2, 7, 9, 0, 0, 7); x.ellipse(cx + 9, cy - 2, 7, 9, 0, 0, 7); x.fill();
  x.fillStyle = '#120d0a'; x.beginPath(); x.arc(cx - 8, cy, 3.6, 0, 7); x.arc(cx + 10, cy, 3.6, 0, 7); x.fill();
  x.strokeStyle = '#3a140e'; x.lineWidth = 2.5; x.beginPath(); x.arc(cx, cy + 9, 7, 0.2, Math.PI - 0.2); x.stroke();
}

function legs(x: Ctx, cx: number, top: number, color: string, shoe = '#2a2420') {
  x.fillStyle = color; x.fillRect(cx - 14, top, 11, 232 - top); x.fillRect(cx + 3, top, 11, 232 - top);
  x.fillStyle = shoe; x.beginPath(); x.ellipse(cx - 9, 236, 11, 6, 0, 0, 7); x.ellipse(cx + 9, 236, 11, 6, 0, 0, 7); x.fill();
}

function arm(x: Ctx, x0: number, y0: number, x1: number, y1: number, sleeve: string, skin: string) {
  x.lineCap = 'round';
  x.strokeStyle = sleeve; x.lineWidth = 11; x.beginPath(); x.moveTo(x0, y0); x.lineTo((x0 + x1) / 2, (y0 + y1) / 2); x.stroke();
  x.strokeStyle = skin; x.lineWidth = 9; x.beginPath(); x.moveTo((x0 + x1) / 2, (y0 + y1) / 2); x.lineTo(x1, y1); x.stroke();
  x.fillStyle = skin; x.beginPath(); x.arc(x1, y1, 6, 0, 7); x.fill();
}

type Painter = (x: Ctx, r: () => number) => void;
const cx = CW / 2;

const PEOPLE: Painter[] = [
  // Market woman in gele and wrapper with a tray of oranges on her head.
  (x, r) => {
    const s = SKIN[Math.floor(r() * 4)], c1 = CLOTH[Math.floor(r() * 9)], c2 = CLOTH[Math.floor(r() * 9)];
    ankara(x, cx - 26, 120, 52, 112, c1, c2);
    x.fillStyle = c1; x.beginPath(); x.ellipse(cx, 112, 28, 26, 0, 0, 7); x.fill();
    arm(x, cx - 22, 104, cx - 34, 60, c1, s); arm(x, cx + 22, 104, cx + 34, 60, c1, s);
    head(x, cx, 78, s);
    x.fillStyle = c2; x.beginPath(); x.ellipse(cx, 56, 30, 16, 0, Math.PI, 0); x.fill();       // gele
    x.beginPath(); x.moveTo(cx - 30, 56); x.quadraticCurveTo(cx - 40, 30, cx - 14, 34); x.quadraticCurveTo(cx + 30, 24, cx + 36, 52); x.fill();
    x.fillStyle = '#9e9e9e'; x.fillRect(cx - 40, 26, 80, 8);                                     // tray
    for (let i = 0; i < 6; i++) { x.fillStyle = '#ff9800'; x.beginPath(); x.arc(cx - 30 + i * 12, 20, 6.5, 0, 7); x.fill(); }
    x.fillStyle = '#2a2420'; x.beginPath(); x.ellipse(cx - 9, 236, 11, 6, 0, 0, 7); x.ellipse(cx + 9, 236, 11, 6, 0, 0, 7); x.fill();
  },
  // Man in a white kaftan and cap.
  (x, r) => {
    const s = SKIN[Math.floor(r() * 4)];
    legs(x, cx, 200, '#e9e6de', '#5a4636');
    x.fillStyle = '#f4f1ea'; x.beginPath(); x.moveTo(cx - 28, 98); x.lineTo(cx + 28, 98); x.lineTo(cx + 34, 205); x.lineTo(cx - 34, 205); x.fill();
    x.strokeStyle = '#d7d1c4'; x.lineWidth = 2; x.beginPath(); x.moveTo(cx, 100); x.lineTo(cx, 150); x.stroke();
    arm(x, cx - 26, 104, cx - 30, 160, '#f4f1ea', s); arm(x, cx + 26, 104, cx + 30, 160, '#f4f1ea', s);
    head(x, cx, 72, s);
    x.fillStyle = r() < 0.5 ? '#f4f1ea' : '#7b1f1f'; x.fillRect(cx - 22, 40, 44, 16); x.beginPath(); x.ellipse(cx, 40, 22, 6, 0, 0, 7); x.fill();
  },
  // Young man in a football jersey with his phone out.
  (x, r) => {
    const s = SKIN[Math.floor(r() * 4)], shirt = CLOTH[Math.floor(r() * 9)];
    legs(x, cx, 160, '#2b3e6b');
    x.fillStyle = shirt; x.fillRect(cx - 26, 96, 52, 70);
    x.fillStyle = '#fff'; x.font = '900 22px Archivo, Arial'; x.textAlign = 'center'; x.fillText(String(Math.floor(r() * 30) + 1), cx, 140);
    arm(x, cx - 24, 104, cx - 28, 154, shirt, s); arm(x, cx + 24, 104, cx + 6, 120, shirt, s);
    x.fillStyle = '#111'; x.fillRect(cx - 2, 108, 12, 20);
    head(x, cx, 72, s);
    x.fillStyle = '#1a1411'; x.beginPath(); x.arc(cx, 66, 26, Math.PI, 0); x.fill();
  },
  // Pure water hawker with a bowl of sachets on her head.
  (x, r) => {
    const s = SKIN[Math.floor(r() * 4)], c = CLOTH[Math.floor(r() * 9)];
    legs(x, cx, 190, s, '#3a3a3a');
    x.fillStyle = c; x.beginPath(); x.moveTo(cx - 24, 98); x.lineTo(cx + 24, 98); x.lineTo(cx + 32, 196); x.lineTo(cx - 32, 196); x.fill();
    arm(x, cx - 22, 104, cx - 28, 46, c, s); arm(x, cx + 22, 104, cx + 30, 150, c, s);
    head(x, cx, 74, s);
    x.fillStyle = '#1a1411'; x.beginPath(); x.arc(cx, 66, 26, Math.PI, 0); x.fill();
    x.fillStyle = '#1565c0'; x.beginPath(); x.ellipse(cx, 44, 38, 10, 0, 0, Math.PI); x.fill();
    for (let i = 0; i < 7; i++) { x.fillStyle = 'rgba(220,240,255,.95)'; x.fillRect(cx - 32 + i * 9, 28 + (i % 2) * 4, 8, 14); x.fillStyle = '#29b6f6'; x.fillRect(cx - 32 + i * 9, 32 + (i % 2) * 4, 8, 3); }
  },
  // Agbero (tout) in a singlet, shouting and pointing.
  (x, r) => {
    const s = SKIN[Math.floor(r() * 4)];
    legs(x, cx, 168, '#5d4a3a');
    x.fillStyle = '#f2f2f2'; x.fillRect(cx - 22, 98, 44, 74); x.fillStyle = s; x.fillRect(cx - 22, 98, 8, 22); x.fillRect(cx + 14, 98, 8, 22);
    arm(x, cx - 22, 104, cx - 50, 70, s, s); arm(x, cx + 22, 104, cx + 26, 160, s, s);
    head(x, cx, 72, s);
    x.fillStyle = '#3a140e'; x.beginPath(); x.ellipse(cx, 84, 8, 7, 0, 0, 7); x.fill();                  // shouting
    x.fillStyle = '#111'; x.fillRect(cx - 24, 46, 48, 10); x.fillRect(cx - 2, 46, 34, 6);                // cap
  },
  // Woman with a baby tied on her back and a shopping bag.
  (x, r) => {
    const s = SKIN[Math.floor(r() * 4)], c1 = CLOTH[Math.floor(r() * 9)], c2 = CLOTH[Math.floor(r() * 9)];
    ankara(x, cx - 28, 110, 56, 122, c2, c1);
    x.fillStyle = c1; x.beginPath(); x.ellipse(cx + 18, 112, 18, 22, 0, 0, 7); x.fill();                  // baby wrap
    head(x, cx + 28, 98, SKIN[Math.floor(r() * 4)], 13);
    arm(x, cx - 22, 106, cx - 30, 170, c1, s);
    x.fillStyle = '#c62828'; x.fillRect(cx - 42, 166, 26, 34); x.fillStyle = '#fff'; x.fillRect(cx - 42, 172, 26, 4);
    head(x, cx - 4, 74, s);
    x.fillStyle = c2; x.beginPath(); x.ellipse(cx - 4, 54, 30, 16, 0, Math.PI, 0); x.fill();
    x.fillStyle = '#2a2420'; x.beginPath(); x.ellipse(cx - 9, 236, 11, 6, 0, 0, 7); x.ellipse(cx + 9, 236, 11, 6, 0, 0, 7); x.fill();
  },
  // Okada man in a union vest and helmet, waiting for passengers.
  (x, r) => {
    const s = SKIN[Math.floor(r() * 4)];
    legs(x, cx, 168, '#33302b');
    x.fillStyle = '#2e5d8a'; x.fillRect(cx - 26, 96, 52, 76);
    x.fillStyle = '#f25c05'; x.fillRect(cx - 22, 100, 44, 66);
    x.fillStyle = '#d9e0e2'; x.fillRect(cx - 22, 118, 44, 5); x.fillRect(cx - 22, 142, 44, 5);
    x.fillStyle = '#111'; x.font = '900 18px Archivo, Arial'; x.textAlign = 'center'; x.fillText(String(100 + Math.floor(r() * 899)), cx, 138);
    arm(x, cx - 24, 104, cx - 30, 160, '#2e5d8a', s); arm(x, cx + 24, 104, cx + 30, 160, '#2e5d8a', s);
    head(x, cx, 72, s);
    x.fillStyle = CLOTH[Math.floor(r() * 9)]; x.beginPath(); x.arc(cx, 68, 30, Math.PI * 1.02, -0.02); x.fill();   // helmet
  },
  // Trader under a big umbrella with her goods basin.
  (x, r) => {
    const s = SKIN[Math.floor(r() * 4)], c = CLOTH[Math.floor(r() * 9)];
    ankara(x, cx - 26, 130, 52, 102, c, '#fff59d');
    x.fillStyle = c; x.beginPath(); x.ellipse(cx, 126, 28, 28, 0, 0, 7); x.fill();
    arm(x, cx - 22, 120, cx - 36, 160, c, s); arm(x, cx + 22, 120, cx + 36, 160, c, s);
    head(x, cx, 94, s);
    x.fillStyle = '#1a1411'; x.beginPath(); x.arc(cx, 88, 26, Math.PI, 0); x.fill();
    x.fillStyle = '#8d6e63'; x.fillRect(cx - 2, 20, 4, 70);
    x.fillStyle = r() < 0.5 ? '#d0141a' : '#1565c0'; x.beginPath(); x.moveTo(cx - 62, 34); x.quadraticCurveTo(cx, -6, cx + 62, 34); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.moveTo(cx - 20, 34); x.quadraticCurveTo(cx, 6, cx + 20, 34); x.fill();
    x.fillStyle = '#2a2420'; x.beginPath(); x.ellipse(cx - 9, 236, 11, 6, 0, 0, 7); x.ellipse(cx + 9, 236, 11, 6, 0, 0, 7); x.fill();
  },
];

let sheet: Texture | null = null;
export const PEOPLE_COUNT = COLS * ROWS;

export function peopleSheet(): Texture {
  if (sheet) return sheet;
  const c = document.createElement('canvas');
  c.width = COLS * CW; c.height = ROWS * CH;
  const x = c.getContext('2d')!;
  for (let i = 0; i < COLS * ROWS; i++) {
    x.save(); x.translate((i % COLS) * CW, Math.floor(i / COLS) * CH);
    x.beginPath(); x.rect(0, 0, CW, CH); x.clip();
    PEOPLE[i % PEOPLE.length](x, rng(300 + i));
    x.restore();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  sheet = t;
  return t;
}

/**
 * A crowd of cut-outs. Each instance stands at (x, z) with a height, picks a sheet cell, and may be
 * mirrored. The vertex shader turns every card to face the camera around the vertical axis.
 */
export function makeCrowd(spots: { x: number; y: number; z: number; h: number; cell: number; flip: boolean }[]): InstancedMesh {
  const geo = new PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const cells = new Float32Array(spots.length * 4);
  spots.forEach((s, i) => {
    const u0 = (s.cell % COLS) / COLS, v0 = 1 - (Math.floor(s.cell / COLS) + 1) / ROWS, du = 1 / COLS, dv = 1 / ROWS;
    cells.set(s.flip ? [u0 + du, v0, -du, dv] : [u0, v0, du, dv], i * 4);
  });
  geo.setAttribute('aCell', new InstancedBufferAttribute(cells, 4));
  const mat = new MeshBasicMaterial({ map: peopleSheet(), alphaTest: 0.5, side: DoubleSide });
  mat.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aCell;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = aCell.xy + uv * aCell.zw;\n#endif')
      .replace('#include <project_vertex>', `
        vec3 centre = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec2 size = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
        vec3 camRight = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
        vec3 world = (modelMatrix * vec4(centre + camRight * position.x * size.x + vec3(0.0, position.y * size.y, 0.0), 1.0)).xyz;
        vec4 mvPosition = viewMatrix * vec4(world, 1.0);
        gl_Position = projectionMatrix * mvPosition;`);
  };
  const mesh = new InstancedMesh(geo, mat, spots.length);
  const m = new Matrix4(), q = new Quaternion(), p = new Vector3(), sc = new Vector3();
  spots.forEach((s, i) => mesh.setMatrixAt(i, m.compose(p.set(s.x, s.y, s.z), q, sc.set(s.h * 0.5, s.h, 1))));
  mesh.frustumCulled = false;
  return mesh;
}
