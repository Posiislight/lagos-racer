import { GRID_SIZE, type GridEntry } from '../src/net/protocol';
import { VEHICLES, type VehicleId } from '../src/config/vehicles';
import { AI_NAMES } from '../src/game/names';
import type { BotView } from './bots';

/**
 * The starting grid; netId is the grid index. With fillAI, AI cars owned by the host take the front places and the
 * humans start behind them in slot order. AI prefer vehicles no human picked, never share a name, and a vehicle that
 * comes round again gets a paint nobody on the grid has for it yet.
 */
export function buildGrid(
  members: { slot: number; name: string; vehicle: VehicleId; paint: string }[],
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
    const painted = new Set(humans.map(m => `${m.vehicle}/${m.paint}`));
    for (let i = 0; i < GRID_SIZE - humans.length; i++) {
      const name = names.splice(Math.floor(random() * names.length), 1)[0] ?? `Racer ${i + 1}`;
      const vehicle = order[i % order.length];
      const paints = VEHICLES.find(v => v.id === vehicle)!.paints.map(p => p.id);
      const free = paints.filter(p => !painted.has(`${vehicle}/${p}`));
      const paint = free.length ? free[Math.floor(random() * free.length)] : paints[0];
      painted.add(`${vehicle}/${paint}`);
      ai.push({ slot: hostSlot, name, vehicle, paint, ai: true });
    }
  }
  const human = humans.map(m => ({ slot: m.slot, name: m.name, vehicle: m.vehicle, paint: m.paint, ai: false }));
  return [...ai, ...human].map((e, netId) => ({ netId, ...e }));
}

/**
 * A Quick race grid: the disguised bots take the front places, all driven by `ownerSlot`'s phone with the real
 * `ai: true`, and the humans start behind them in slot order. netId is the grid index.
 */
export function buildQuickGrid(
  humans: { slot: number; name: string; vehicle: VehicleId; paint: string }[],
  bots: BotView[],
  ownerSlot: number,
): GridEntry[] {
  const front = bots.map(b => ({ slot: ownerSlot, name: b.name, vehicle: b.vehicle, paint: b.paint, ai: true }));
  const back = [...humans]
    .sort((a, b) => a.slot - b.slot)
    .map(m => ({ slot: m.slot, name: m.name, vehicle: m.vehicle, paint: m.paint, ai: false }));
  return [...front, ...back].map((e, netId) => ({ netId, ...e }));
}
