import { project, wrapDelta, type Track } from './track.ts';

/**
 * Out-and-back tracks along a real road: race one way on one carriageway, U-turn, come back on the
 * other. The road is given as its "axis", a polyline from the east end to the west end in metres
 * (x east, z south). Nigeria drives on the right, so the outbound leg is on the right of the axis
 * and the median is always on the racers' left.
 */

type Axis = [number, number][];

/** Position, unit direction of travel and unit normal to the right of travel, `d` metres along the axis. */
export function axisPoint(axis: Axis, d: number) {
  let left = Math.max(0, d);
  for (let i = 1; i < axis.length; i++) {
    const [ax, az] = axis[i - 1], [bx, bz] = axis[i], len = Math.hypot(bx - ax, bz - az);
    if (left <= len || i === axis.length - 1) {
      const t = len ? Math.min(left, len) / len : 0, tx = (bx - ax) / (len || 1), tz = (bz - az) / (len || 1);
      // Right of travel = tangent × up, as in buildTrack: (-tz, tx).
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, tx, tz, nx: -tz, nz: tx };
    }
    left -= len;
  }
  const [x, z] = axis[0];
  return { x, z, tx: 1, tz: 0, nx: 0, nz: -1 };
}

const axisLength = (axis: Axis) => axis.reduce((L, p, i) => (i ? L + Math.hypot(p[0] - axis[i - 1][0], p[1] - axis[i - 1][1]) : 0), 0);
const smoothstep = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/**
 * Control points for `buildTrack`: the north (outbound) leg, a U-turn round the west end, the south
 * leg back, and a U-turn round the east end, starting at the start line `startAt` metres along the
 * axis. Near each end the legs splay apart (over `splay` metres) to the U-turn radius.
 */
export function outAndBack(axis: Axis, o: { gap: number; turnRadius: number; startAt: number; splay?: number }): [number, number][] {
  const L = axisLength(axis), splay = o.splay ?? 30, R = o.turnRadius;
  const off = (d: number) => o.gap / 2 + (R - o.gap / 2) * smoothstep(splay, 0, Math.min(d, L - d));
  const ds: number[] = [];
  axis.forEach((p, i) => ds.push(i ? ds[i - 1] + Math.hypot(p[0] - axis[i - 1][0], p[1] - axis[i - 1][1]) : 0));
  const leg = (d: number, side: 1 | -1): [number, number] => { const a = axisPoint(axis, d), k = off(d) * side; return [a.x + a.nx * k, a.z + a.nz * k]; };
  const arc = (c: ReturnType<typeof axisPoint>, sign: 1 | -1) => {
    // West end: from north (+n) through west (+t) to south (-n). East end: from south through east to north.
    const out: [number, number][] = [];
    for (let deg = 30; deg <= 150; deg += 30) {
      const th = (deg * Math.PI) / 180, tx = c.tx * sign, tz = c.tz * sign;
      out.push([c.x + R * (c.nx * Math.cos(th) * sign + tx * Math.sin(th)), c.z + R * (c.nz * Math.cos(th) * sign + tz * Math.sin(th))]);
    }
    return out;
  };

  // North leg east to west, with the start point inserted, then the rest of the loop.
  const north = ds.filter(d => d > o.startAt).map(d => leg(d, 1));
  const before = ds.filter(d => d < o.startAt).map(d => leg(d, 1));
  const south = [...ds].reverse().map(d => leg(d, -1));
  return [leg(o.startAt, 1), ...north, ...arc(axisPoint(axis, L), 1), ...south, ...arc(axisPoint(axis, 0), -1), ...before];
}

/** Per track sample: true where the left side faces the other leg across the median. */
export function medianMask(track: Track, halfWidth: number, medianWidth: number): boolean[] {
  const gap = 2 * halfWidth + medianWidth;
  return track.points.map(p => {
    const x = p.pos.x - p.right.x * gap, z = p.pos.z - p.right.z * gap;
    const q = project(track, x, z);
    return Math.abs(q.lateral) < 1.5 && Math.abs(wrapDelta(track, p.s, q.s)) > 60;
  });
}

/** Lap distance of the leg next to the given street, `d` metres along the axis. */
export function roadToS(track: Track, axis: Axis, d: number, street: 'north' | 'south', gap: number): number {
  const a = axisPoint(axis, d), k = (street === 'north' ? 1 : -1) * gap / 2;
  return project(track, a.x + a.nx * k, a.z + a.nz * k).s;
}
