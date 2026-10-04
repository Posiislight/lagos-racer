import type { Result } from './store';
import type { Racer } from './runtime';

/**
 * The results rows for a finished race, in the order given (best first). An unfinished racer gets a
 * finish time projected from its average speed, but only when the race has a lap limit to project to.
 */
export function buildResults(order: Racer[], clock: number, laps: number, trackLength: number): Result[] {
  const total = laps * trackLength;
  return order.map(r => {
    const done = r.progress.finishTime;
    // Only a racer still in a race with a lap limit has a finish to project.
    const finite = Number.isFinite(laps) && r.outAt === null;
    const avg = r.progress.distance > 0 ? r.progress.distance / clock : 0;
    const projection = done === null && finite && avg > 1 ? clock + (total - r.progress.distance) / avg : null;
    return {
      name: r.name, vehicle: r.vehicle.id, color: r.paint.color, isPlayer: r.isPlayer,
      time: done ?? projection, projected: done === null && finite,
      best: r.progress.lapTimes.length ? Math.min(...r.progress.lapTimes) : null,
      out: r.outAt,
    };
  });
}
