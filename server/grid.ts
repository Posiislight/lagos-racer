import { GRID_SIZE, type GridEntry } from '../src/net/protocol';
import { VEHICLES, type VehicleId } from '../src/config/vehicles';
import { AI_NAMES } from '../src/game/names';

/**
 * The starting grid; netId is the grid index. With fillAI, AI cars owned by the host take the front places and the
 * humans start behind them in slot order. AI prefer vehicles no human picked, and never share a name.
 */
export function buildGrid(
  members: { slot: number; name: string; vehicle: VehicleId }[],
  fillAI: boolean,
  hostSlot: number,
  random: () => number,
): GridEntry[] {
  const humans = [...members].sort((a, b) => a.slot - b.slot);
  const ai: Omit<GridEntry, 'netId'>[] = [];
  if (fillAI) {
    const taken = new Set(humans.map(m => m.vehicle));
    const ids = VEHICLES.map(v => v.id);
    const order = [...ids.filter(id => !taken.has(id)), ...ids.filter(id => taken.has(id))];
    const names = [...AI_NAMES];
    for (let i = 0; i < GRID_SIZE - humans.length; i++) {
      const name = names.splice(Math.floor(random() * names.length), 1)[0] ?? `Racer ${i + 1}`;
      ai.push({ slot: hostSlot, name, vehicle: order[i % order.length], ai: true });
    }
  }
  const human = humans.map(m => ({ slot: m.slot, name: m.name, vehicle: m.vehicle, ai: false }));
  return [...ai, ...human].map((e, netId) => ({ netId, ...e }));
}
