import type { Result } from '../game/store';
import type { NetResult } from './protocol';

/** The room's results as the results screen shows them. Only my own human car is "me": names and rides can repeat. */
export function toResults(net: NetResult[], mySlot: number): Result[] {
  return [...net].sort((a, b) => a.place - b.place).map(r => ({
    name: r.name,
    vehicle: r.vehicle,
    time: r.dnf ? null : r.time,
    projected: r.projected,
    best: r.best,
    isPlayer: !r.ai && r.slot === mySlot,
  }));
}
