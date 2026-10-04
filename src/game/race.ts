import { project, wrapDelta, type Track } from './track';

/**
 * Lap counting by unwrapped distance along the centre line. Every frame the car's track distance
 * is compared with the last frame's, and the (wrapped) difference is added to a running total.
 * Driving backwards subtracts, so you can't bank laps by crossing the line back and forth, and a
 * jump bigger than MAX_STEP in one update (a respawn, or a glitch) is ignored rather than counted.
 * Barriers stop the infield being cut, so this is equivalent to ordered checkpoints.
 */
export type RacerProgress = {
  /** Track sample index from the last update, used as the projection search hint. */
  index: number;
  /** Track distance from the last update, in [0, length). */
  s: number;
  /** Total distance driven along the track since the start line. Negative on the grid. */
  distance: number;
  /** Laps fully completed (never decreases). */
  lapsDone: number;
  /** Lap times in seconds. */
  lapTimes: number[];
  /** Race clock time when the current lap started. */
  lapStart: number;
  /** Race clock time at the finish, or null while racing. */
  finishTime: number | null;
  /** Signed distance from the centre line (positive right). */
  lateral: number;
};

export const MAX_STEP = 25;

export function createProgress(track: Track, x: number, z: number): RacerProgress {
  const p = project(track, x, z);
  // Cars start on the grid just behind the line, so a distance near the end of the lap is negative.
  const distance = p.s > track.length / 2 ? p.s - track.length : p.s;
  return { index: p.index, s: p.s, distance, lapsDone: 0, lapTimes: [], lapStart: 0, finishTime: null, lateral: p.lateral };
}

export type LapEvent = { lap: number; time: number; finished: boolean } | null;

/** Advance a racer's progress from its new position. Returns an event when a lap is completed. */
export function updateProgress(track: Track, r: RacerProgress, x: number, z: number, clock: number, totalLaps: number): LapEvent {
  const p = project(track, x, z, r.index);
  const d = wrapDelta(track, r.s, p.s);
  if (Math.abs(d) <= MAX_STEP) r.distance += d;
  r.index = p.index; r.s = p.s; r.lateral = p.lateral;
  if (r.finishTime !== null) return null;
  const laps = Math.floor(r.distance / track.length);
  if (laps > r.lapsDone) {
    r.lapsDone = laps;
    const time = clock - r.lapStart;
    r.lapTimes.push(time);
    r.lapStart = clock;
    const finished = laps >= totalLaps;
    if (finished) r.finishTime = clock;
    return { lap: laps, time, finished };
  }
  return null;
}

/** Re-sync after a respawn: the car was moved, so take its new spot without counting the jump. */
export function resyncProgress(track: Track, r: RacerProgress, x: number, z: number) {
  const p = project(track, x, z, r.index, 80);
  r.distance += wrapDelta(track, r.s, p.s);
  r.index = p.index; r.s = p.s; r.lateral = p.lateral;
}

/** The banner for completing lap `lap` of `laps`; none when the race has no lap limit. */
export function lapMessage(lap: number, laps: number): string | null {
  if (!Number.isFinite(laps)) return null;
  return lap === laps - 1 ? 'FINAL LAP!' : `LAP ${lap + 1}`;
}

/** The lap the racer is on now, 1-based and clamped to the race length. */
export function currentLap(r: RacerProgress, totalLaps: number) {
  return Math.min(totalLaps, Math.max(1, r.lapsDone + 1));
}

/** Race order: finished racers by finish time, then everyone else by distance driven. */
export function standings<T extends { progress: Pick<RacerProgress, 'distance' | 'finishTime'> }>(racers: T[]): T[] {
  return [...racers].sort((a, b) => {
    const fa = a.progress.finishTime, fb = b.progress.finishTime;
    if (fa !== null && fb !== null) return fa - fb;
    if (fa !== null) return -1;
    if (fb !== null) return 1;
    return b.progress.distance - a.progress.distance;
  });
}

export function formatTime(t: number | null | undefined) {
  if (t === null || t === undefined || !isFinite(t)) return '--:--.--';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
