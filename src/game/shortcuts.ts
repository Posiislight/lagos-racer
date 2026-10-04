import { CatmullRomCurve3, Vector3 } from 'three';
import { project, sampleAt, type Projection, type Track, type TrackPoint } from './track';

/**
 * Shortcuts: side roads that leave the main road at one lap distance and rejoin it at a later one.
 * A track lists them as data (`shortcuts` in its config); nothing else about the track changes.
 *
 * Lap counting stays on the main road. A racer on a branch is given the equivalent main-road distance
 * (the fraction of the branch driven, spread over the stretch of road it replaces), so progress is
 * continuous at the fork and at the rejoin, positions stay right, and a shorter branch really is
 * quicker to drive. Nothing can skip the start line: a branch lies strictly inside one lap.
 */
export type Shortcut = {
  id: string;
  /** Lap distances (m) on the main road where the branch leaves and where it rejoins, from < to. */
  from: number;
  to: number;
  /** Waypoints [x, z] between the fork and the rejoin. The ends are added from the main road. */
  path: [number, number][];
  /** Defaults to the main road's half width. */
  halfWidth?: number;
};

export type Branch = {
  id: string;
  from: number;
  to: number;
  halfWidth: number;
  points: TrackPoint[];
  length: number;
  spacing: number;
  /** Main-road metres skipped: positive when the branch is shorter than the road it replaces. */
  saves: number;
};

const UP = new Vector3(0, 1, 0);
/** How far the branch runs along the main road's direction at the fork and rejoin, so it leaves tangentially. */
const LEAD = 14;

/** Sample a shortcut as an open road, tangent to the main road at both ends and eased between their heights. */
export function buildBranch(main: Track, sc: Shortcut, mainHalfWidth: number, spacing = 2): Branch {
  const a = sampleAt(main, sc.from), b = sampleAt(main, sc.to);
  const flat = (v: Vector3) => new Vector3(v.x, 0, v.z);
  const control = [
    flat(a.pos), flat(a.pos).addScaledVector(a.tangent, LEAD),
    ...sc.path.map(([x, z]) => new Vector3(x, 0, z)),
    flat(b.pos).addScaledVector(b.tangent, -LEAD), flat(b.pos),
  ];
  const curve = new CatmullRomCurve3(control, false, 'centripetal');
  const n = Math.max(8, Math.round(curve.getLength() / spacing));
  const raw = curve.getSpacedPoints(n);
  let length = 0;
  const points: TrackPoint[] = raw.map((pos, i) => {
    const next = raw[Math.min(n, i + 1)], prev = raw[Math.max(0, i - 1)];
    const tangent = next.clone().sub(prev).normalize();
    const p: TrackPoint = { pos, tangent, right: tangent.clone().cross(UP).normalize(), s: length, curvature: 0 };
    length += pos.distanceTo(next);
    return p;
  });
  const step = length / n;
  points.forEach((p, i) => {
    const t0 = points[Math.max(0, i - 1)].tangent, t1 = points[Math.min(n, i + 1)].tangent;
    p.curvature = -Math.atan2(t0.x * t1.z - t0.z * t1.x, t0.x * t1.x + t0.z * t1.z) / (2 * step);
    const u = p.s / length;
    p.pos.y = a.pos.y + (b.pos.y - a.pos.y) * (1 - Math.cos(Math.PI * u)) / 2;
  });
  return {
    id: sc.id, from: sc.from, to: sc.to, halfWidth: sc.halfWidth ?? mainHalfWidth,
    points, length, spacing: length / n, saves: sc.to - sc.from - length,
  };
}

/** What is wrong with a shortcut, if anything. Empty means it is fine to add. */
export function checkShortcut(main: Track, branch: Branch, mainHalfWidth: number): string[] {
  const problems: string[] = [];
  const { from, to, id } = branch;
  if (!(from >= 0 && to <= main.length && to - from >= 40)) problems.push(`${id}: needs 0 <= from < to <= lap length, at least 40 m apart`);
  if (branch.saves <= 0) problems.push(`${id}: not shorter than the road it replaces (${branch.saves.toFixed(0)} m)`);
  const minRadius = Math.min(...branch.points.map(p => 1 / Math.max(1e-6, Math.abs(p.curvature))));
  if (minRadius < 12) problems.push(`${id}: bend of radius ${minRadius.toFixed(1)} m is tighter than a BRT can take (12 m)`);
  // Away from the fork and the rejoin, the branch must not run into the main road (or any other part of the lap).
  const apart = mainHalfWidth + branch.halfWidth + 1;
  for (const p of branch.points) {
    if (p.s < LEAD * 2 || p.s > branch.length - LEAD * 2) continue;
    for (const q of main.points) {
      if (Math.hypot(p.pos.x - q.pos.x, p.pos.z - q.pos.z) < apart && Math.abs(p.pos.y - q.pos.y) < 6) {
        problems.push(`${id}: runs into the main road at lap distance ${q.s.toFixed(0)} m`);
        return problems;
      }
    }
  }
  return problems;
}

/** Position on a branch: distance along it, and signed distance from its centre line (positive is right). */
export function projectBranch(branch: Branch, x: number, z: number) {
  const { points } = branch;
  let best = 0, bestD = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = (points[i].pos.x - x) ** 2 + (points[i].pos.z - z) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  const cur = points[best], along = (x - cur.pos.x) * cur.tangent.x + (z - cur.pos.z) * cur.tangent.z;
  const i0 = along >= 0 ? best : Math.max(0, best - 1), i1 = Math.min(points.length - 1, i0 + 1);
  const a = points[i0], b = points[i1];
  const sx = b.pos.x - a.pos.x, sz = b.pos.z - a.pos.z, len = Math.hypot(sx, sz) || 1;
  const t = Math.min(1, Math.max(0, ((x - a.pos.x) * sx + (z - a.pos.z) * sz) / (len * len)));
  const px = a.pos.x + sx * t, pz = a.pos.z + sz * t;
  const rx = a.right.x + (b.right.x - a.right.x) * t, rz = a.right.z + (b.right.z - a.right.z) * t;
  return { s: a.s + t * len, lateral: (x - px) * rx + (z - pz) * rz, dist: Math.hypot(x - px, z - pz), index: i0 };
}

/** The main-road distance equivalent to being `s` metres along a branch. */
export const mainDistance = (branch: Branch, s: number) => branch.from + (s / branch.length) * (branch.to - branch.from);

/**
 * Like `project`, but a car on a shortcut is reported at its main-road equivalent. The nearest centre
 * line wins, so at the fork and the rejoin (where both roads meet) the answer is continuous.
 */
export function projectRoad(track: Track, x: number, z: number, hint?: number, window = 40): Projection {
  const main = project(track, x, z, hint, window);
  if (!track.branches?.length) return main;
  // Distance to the main road's centre line, from the same samples project() chose between.
  const m = track.points[main.index], mainDist = Math.abs(main.lateral) || Math.hypot(x - m.pos.x, z - m.pos.z);
  let best: Projection = main, bestDist = mainDist;
  for (const br of track.branches) {
    const bp = projectBranch(br, x, z);
    // Only count a branch when the car is actually on it (not past its ends, not across the water).
    if (bp.dist > br.halfWidth + 2 || bp.dist >= bestDist) continue;
    const s = mainDistance(br, bp.s);
    best = { index: Math.min(track.points.length - 1, Math.floor(s / track.spacing)), s, lateral: bp.lateral };
    bestDist = bp.dist;
  }
  return best;
}
