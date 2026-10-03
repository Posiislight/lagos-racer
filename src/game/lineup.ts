import { VEHICLES, type VehicleId } from '../config/vehicles';

export type Pick = { vehicle: VehicleId; paint: string };

/**
 * The rest of the grid: every vehicle at least once (so there's always a BRT to fear and an okada
 * to chase), then random ones, each in a paint nobody else on the grid has for that vehicle,
 * and never exactly the player's vehicle and paint.
 */
export function pickRivals(player: Pick, count: number, rand: () => number = Math.random): Pick[] {
  const ids = VEHICLES.map(v => v.id).sort(() => rand() - 0.5);
  while (ids.length < count) ids.push(VEHICLES[Math.floor(rand() * VEHICLES.length)].id);
  const taken = new Set([`${player.vehicle}/${player.paint}`]);
  return ids.slice(0, count).map(id => {
    const free = VEHICLES.find(v => v.id === id)!.paints.filter(p => !taken.has(`${id}/${p.id}`));
    const paint = free[Math.floor(rand() * free.length)].id;
    taken.add(`${id}/${paint}`);
    return { vehicle: id, paint };
  });
}
