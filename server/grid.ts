import type { GridEntry } from '../src/net/protocol';
import type { VehicleId } from '../src/config/vehicles';

/** Humans in slot order, front to back; netId is the grid index. */
export function buildGrid(members: { slot: number; name: string; vehicle: VehicleId }[]): GridEntry[] {
  return [...members]
    .sort((a, b) => a.slot - b.slot)
    .map((m, netId) => ({ netId, slot: m.slot, name: m.name, vehicle: m.vehicle, ai: false }));
}
