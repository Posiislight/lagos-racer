import { Quaternion } from 'three';
import { TICK_HZ, type CarState } from './protocol';

export type Pose = {
  x: number; y: number; z: number;
  qx: number; qy: number; qz: number; qw: number;
  vx: number; vy: number; vz: number;
};

const KEEP = 32;
const LATENESS_WINDOW = 30;
const CUSHION_MIN = 0.1;
const CUSHION_MAX = 0.25;
const EXTRAP_MAX = 0.25;

type Entry = { car: CarState; time: number; lateness: number };

const qa = new Quaternion();
const qb = new Quaternion();
const qr = new Quaternion();

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function std(xs: number[]): number {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
}

function setFrom(c: CarState, out: Pose) {
  out.x = c.x; out.y = c.y; out.z = c.z;
  out.qx = c.qx; out.qy = c.qy; out.qz = c.qz; out.qw = c.qw;
  out.vx = c.vx; out.vy = c.vy; out.vz = c.vz;
}

/** The last few snapshots of one remote car, replayed a little behind real time so motion stays smooth. */
export class SnapshotBuffer {
  private entries: Entry[] = [];
  private cachedDelay = CUSHION_MIN;

  /** `arrival` is the local synced race clock at receipt. Snapshots not newer than the newest are dropped. */
  push(car: CarState, time: number, arrival: number): void {
    const last = this.entries[this.entries.length - 1];
    if (last && time <= last.time) return;
    this.entries.push({ car, time, lateness: arrival - time });
    if (this.entries.length > KEEP) this.entries.shift();
    // Worked out once per snapshot, not per frame: this is read every frame for every remote car.
    const late = this.entries.slice(-LATENESS_WINDOW).map(e => e.lateness);
    const cushion = Math.min(CUSHION_MAX, Math.max(CUSHION_MIN, 1 / TICK_HZ + 2 * std(late)));
    this.cachedDelay = median(late) + cushion;
  }

  /** Measured network delay plus a jitter cushion, in seconds. */
  get delay(): number {
    return this.cachedDelay;
  }

  renderTimeAt(now: number): number {
    return now - this.delay;
  }

  latest(): CarState | null {
    return this.entries.length ? this.entries[this.entries.length - 1].car : null;
  }

  /** Fills `out` with the pose at `renderTime`. Times before the oldest snapshot or well past the newest hold still. */
  sample(renderTime: number, out: Pose): 'interp' | 'extrap' | 'hold' | 'empty' {
    const es = this.entries;
    if (!es.length) return 'empty';
    const first = es[0];
    if (renderTime <= first.time) {
      setFrom(first.car, out);
      return 'hold';
    }
    const last = es[es.length - 1];
    if (renderTime >= last.time) {
      setFrom(last.car, out);
      const dt = renderTime - last.time;
      const t = Math.min(dt, EXTRAP_MAX);
      out.x += last.car.vx * t; out.y += last.car.vy * t; out.z += last.car.vz * t;
      return dt <= EXTRAP_MAX ? 'extrap' : 'hold';
    }
    let i = es.length - 2;
    while (i > 0 && es[i].time > renderTime) i--;
    const a = es[i], b = es[i + 1];
    const k = (renderTime - a.time) / (b.time - a.time);
    const ca = a.car, cb = b.car;
    out.x = ca.x + (cb.x - ca.x) * k;
    out.y = ca.y + (cb.y - ca.y) * k;
    out.z = ca.z + (cb.z - ca.z) * k;
    out.vx = ca.vx + (cb.vx - ca.vx) * k;
    out.vy = ca.vy + (cb.vy - ca.vy) * k;
    out.vz = ca.vz + (cb.vz - ca.vz) * k;
    qa.set(ca.qx, ca.qy, ca.qz, ca.qw);
    qb.set(cb.qx, cb.qy, cb.qz, cb.qw);
    qr.slerpQuaternions(qa, qb, k);
    out.qx = qr.x; out.qy = qr.y; out.qz = qr.z; out.qw = qr.w;
    return 'interp';
  }
}
