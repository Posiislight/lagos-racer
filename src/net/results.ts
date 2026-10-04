import type { Result } from '../game/store';
import { coinsForPlace } from '../game/race';
import type { NetResult } from './protocol';

export const DNF_COINS = 20;

/** What my result earns: by place, but a DNF only gets the flat consolation. */
export const coinsFor = (mine: NetResult) => (mine.dnf ? DNF_COINS : coinsForPlace(mine.place));

/** The room's results as the results screen shows them. Only my own human car is "me": names and rides can repeat. */
export function toResults(net: NetResult[], mySlot: number): Result[] {
  return [...net].sort((a, b) => a.place - b.place).map(r => ({
    name: r.name,
    vehicle: r.vehicle,
    time: r.dnf ? null : r.time,
    projected: r.projected,
    best: r.best,
    isPlayer: !r.ai && r.slot === mySlot,
    dnf: r.dnf,
  }));
}
