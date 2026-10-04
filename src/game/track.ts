import { CatmullRomCurve3, Vector3 } from 'three';

export type TrackPoint = {
  /** Position on the centre line (y = 0). */
  pos: Vector3;
  /** Unit direction of travel. */
  tangent: Vector3;
  /** Unit vector pointing to the right of the direction of travel. */
  right: Vector3;
  /** Distance along the centre line from the start/finish line. */
  s: number;
  /** Signed curvature (1/m); positive bends left. */
  curvature: number;
};

export type Track = {
  points: TrackPoint[];
  length: number;
  spacing: number;
  curve: CatmullRomCurve3;
};

export type Projection = {
  /** Index of the sample just before the projected point. */
  index: number;
  /** Distance along the track, in [0, length). */
  s: number;
  /** Signed distance from the centre line; positive is to the right. */
  lateral: number;
};

const UP = new Vector3(0, 1, 0);

/**
 * Rolling hills along the lap: each wave is [height in m, waves per lap, phase]. The road is level
 * side to side; its height only changes along its length, and the start line sits at 0.
 */
export type Hills = [number, number, number][];

export function hillHeight(hills: Hills | undefined, s: number, length: number) {
  if (!hills?.length) return 0;
  const at = (d: number) => hills.reduce((y, [a, k, ph]) => y + a * Math.sin((d / length) * Math.PI * 2 * k + ph), 0);
  return at(s) - at(0);
}

/**
 * What hills follow: the lap distance ('lap'), world x ('x'), or any position along a road, given as
 * a function of (x, z) such as the distance along an out-and-back road's axis. The last two keep both
 * legs of an out-and-back road at the same height wherever they run side by side.
 */
export type HillsAlong = 'lap' | 'x' | ((x: number, z: number) => number);

/** Build an evenly sampled closed track from control points given as [x, z] pairs. */
export function buildTrack(control: [number, number][], spacing = 2, hills?: Hills, hillsAxis: HillsAlong = 'lap'): Track {
  const curve = new CatmullRomCurve3(control.map(([x, z]) => new Vector3(x, 0, z)), true, 'centripetal');
  const approx = curve.getLength();
  const n = Math.max(16, Math.round(approx / spacing));
  const raw = curve.getSpacedPoints(n).slice(0, n);
  const length = raw.reduce((acc, p, i) => acc + p.distanceTo(raw[(i + 1) % n]), 0);
  let s = 0;
  const points: TrackPoint[] = raw.map((pos, i) => {
    const next = raw[(i + 1) % n], prev = raw[(i - 1 + n) % n];
    const tangent = next.clone().sub(prev).normalize();
    const right = tangent.clone().cross(UP).normalize();
    const p: TrackPoint = { pos, tangent, right, s, curvature: 0 };
    s += pos.distanceTo(next);
    return p;
  });
  const step = length / n;
  if (hills?.length && hillsAxis !== 'lap') {
    const along = hillsAxis === 'x' ? (x: number) => x : hillsAxis;
    const u = points.map(p => along(p.pos.x, p.pos.z)), min = Math.min(...u), span = Math.max(...u) - min || 1;
    const at = (v: number) => hills.reduce((y, [a, k, ph]) => y + a * Math.sin(((v - min) / span) * Math.PI * 2 * k + ph), 0);
    const y0 = at(u[0]);
    points.forEach((p, i) => { p.pos.y = at(u[i]) - y0; });
  } else if (hills?.length) points.forEach(p => { p.pos.y = hillHeight(hills, p.s, length); });
  points.forEach((p, i) => {
    const a = points[(i - 1 + n) % n].tangent, b = points[(i + 1) % n].tangent;
    // Right is +z when heading +x, so a left bend turns towards -z and makes this angle negative.
    const turn = Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z);
    p.curvature = -turn / (2 * step);
  });
  return { points, length, spacing: length / n, curve };
}

/**
 * Project a world position onto the track. Pass the previous index as a hint to search only
 * nearby samples (cheap, and stops a car snapping to a different part of the track that
 * happens to be close, such as under a bridge). Without a hint the whole track is searched.
 */
export function project(track: Track, x: number, z: number, hint?: number, window = 40): Projection {
  const { points } = track, n = points.length;
  let best = 0, bestD = Infinity;
  const check = (i: number) => {
    const p = points[i].pos, d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  };
  if (hint === undefined) for (let i = 0; i < n; i++) check(i);
  else for (let k = -window; k <= window; k++) check((((hint + k) % n) + n) % n);

  // Decide whether the point sits on the segment before or after the nearest sample.
  const cur = points[best], next = points[(best + 1) % n], prev = points[(best - 1 + n) % n];
  const along = (x - cur.pos.x) * cur.tangent.x + (z - cur.pos.z) * cur.tangent.z;
  const a = along >= 0 ? cur : prev, b = along >= 0 ? next : cur;
  const idx = along >= 0 ? best : (best - 1 + n) % n;
  const segX = b.pos.x - a.pos.x, segZ = b.pos.z - a.pos.z, segLen = Math.hypot(segX, segZ) || 1;
  const t = Math.min(1, Math.max(0, ((x - a.pos.x) * segX + (z - a.pos.z) * segZ) / (segLen * segLen)));
  let s = a.s + t * segLen;
  if (s >= track.length) s -= track.length;
  const px = a.pos.x + segX * t, pz = a.pos.z + segZ * t;
  const rx = a.right.x + (b.right.x - a.right.x) * t, rz = a.right.z + (b.right.z - a.right.z) * t;
  const lateral = (x - px) * rx + (z - pz) * rz;
  return { index: idx, s, lateral };
}

/** Sample the track at distance s (wraps around). Returns position, tangent and right vectors. */
export function sampleAt(track: Track, s: number): { pos: Vector3; tangent: Vector3; right: Vector3; index: number } {
  const { points, length } = track, n = points.length;
  s = ((s % length) + length) % length;
  let lo = 0, hi = n - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (points[mid].s <= s) lo = mid; else hi = mid - 1; }
  const a = points[lo], b = points[(lo + 1) % n];
  const segLen = (lo === n - 1 ? length : b.s) - a.s || 1;
  const t = (s - a.s) / segLen;
  return {
    pos: a.pos.clone().lerp(b.pos, t),
    tangent: a.tangent.clone().lerp(b.tangent, t).normalize(),
    right: a.right.clone().lerp(b.right, t).normalize(),
    index: lo,
  };
}

/** Shortest signed difference between two track distances (b - a), wrapped to (-L/2, L/2]. */
export function wrapDelta(track: Track, a: number, b: number): number {
  let d = b - a;
  const L = track.length;
  if (d > L / 2) d -= L;
  if (d <= -L / 2) d += L;
  return d;
}

/** Ground height at (x, z): the height of the nearest stretch of road (the road is level across). */
export function heightAt(track: Track, x: number, z: number, hint?: number): number {
  const p = project(track, x, z, hint);
  return sampleAt(track, p.s).pos.y;
}

/** Smallest distance from (x, z) to any centre-line sample. Used to keep scenery off the road. */
export function distanceToCentre(track: Track, x: number, z: number): number {
  let best = Infinity;
  for (const p of track.points) best = Math.min(best, (p.pos.x - x) ** 2 + (p.pos.z - z) ** 2);
  return Math.sqrt(best);
}
