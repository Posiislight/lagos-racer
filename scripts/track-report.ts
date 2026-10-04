// Check a track layout: length, tightest bend, and any place where two parts of the loop come
// too close (their barriers would overlap). Writes a top-down SVG next to the given path.
// Usage: node scripts/track-report.ts [trackId] [out.svg]
import { writeFileSync } from 'node:fs';
import { TRACKS, trackFor } from '../src/config/tracks.ts';
import { medianMask } from '../src/game/outAndBack.ts';

const id = process.argv[2] || 'ojuelegba';
const out = process.argv[3] || `track-${id}.svg`;
const cfg = TRACKS.find(t => t.id === id)!;
const track = trackFor(cfg);
const pts = track.points, n = pts.length;
// Out-and-back roads: the two legs run a median apart on purpose; only report them if closer than that.
const mask = cfg.median ? medianMask(track, cfg.halfWidth, cfg.median.width) : pts.map(() => false);
const medianGap = 2 * cfg.halfWidth + (cfg.median?.width ?? 0) - 0.5;

const minRadius = Math.min(...pts.map(p => 1 / Math.max(1e-6, Math.abs(p.curvature))));
const grades = pts.map((p, i) => Math.abs(pts[(i + 1) % n].pos.y - p.pos.y) / track.spacing);
const maxGrade = Math.max(...grades), heights = pts.map(p => p.pos.y);
let closest = { d: Infinity, a: 0, b: 0 };
for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
  const along = Math.min(Math.abs(pts[i].s - pts[j].s), track.length - Math.abs(pts[i].s - pts[j].s));
  if (along < 60) continue;
  const d = pts[i].pos.distanceTo(pts[j].pos);
  if (mask[i] && mask[j] && d >= medianGap) continue;
  if (d < closest.d) closest = { d, a: pts[i].s, b: pts[j].s };
}
if (cfg.invented?.length) console.log('INVENTED geometry (not from the map):', JSON.stringify(cfg.invented));
console.log(JSON.stringify({ id, length: +track.length.toFixed(1), samples: n, minRadius: +minRadius.toFixed(1), maxGradePct: +(maxGrade * 100).toFixed(1), medianSamples: mask.filter(Boolean).length, heightRange: [+Math.min(...heights).toFixed(1), +Math.max(...heights).toFixed(1)],
  closestSections: { gap: +closest.d.toFixed(1), atS: [+closest.a.toFixed(0), +closest.b.toFixed(0)] } }, null, 2));

const xs = pts.map(p => p.pos.x), zs = pts.map(p => p.pos.z), pad = 30;
const minX = Math.min(...xs) - pad, minZ = Math.min(...zs) - pad, w = Math.max(...xs) + pad - minX, h = Math.max(...zs) + pad - minZ;
const path = pts.map((p, i) => `${i ? 'L' : 'M'}${(p.pos.x - minX).toFixed(1)},${(p.pos.z - minZ).toFixed(1)}`).join('') + 'Z';
const marks = pts.filter((_, i) => i % 25 === 0).map(p =>
  `<text x="${(p.pos.x - minX).toFixed(0)}" y="${(p.pos.z - minZ).toFixed(0)}" font-size="9" fill="#000">${p.s.toFixed(0)}</text>`).join('');
writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}" width="${(w * 3).toFixed(0)}" height="${(h * 3).toFixed(0)}">
<rect width="100%" height="100%" fill="#d9a066"/><path d="${path}" fill="none" stroke="#333" stroke-width="${cfg.halfWidth * 2}" stroke-linejoin="round"/>
<path d="${path}" fill="none" stroke="#fff" stroke-width="0.6" stroke-dasharray="4 4"/>
<circle cx="${(pts[0].pos.x - minX).toFixed(1)}" cy="${(pts[0].pos.z - minZ).toFixed(1)}" r="4" fill="#f5b400"/>${marks}</svg>`);
console.log('wrote', out);
