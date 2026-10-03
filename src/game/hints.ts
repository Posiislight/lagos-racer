import type { ItemKind } from './runtime';

/** How many pickups get the full how-to hint before it's just the item's name. */
export const HINT_PICKUPS = 3;

const NAME: Record<ItemKind, string> = { fuel: 'FUEL', oil: 'CRUDE OIL', juju: 'JUJU' };
const WHAT: Record<ItemKind, string> = { fuel: 'for a speed boost', oil: 'to drop it behind you', juju: 'to throw it at the racer ahead' };

/** The message flashed when you pick up a power-up. */
export function itemHint(kind: ItemKind, input: 'keys' | 'touch', shown: number): string {
  if (shown >= HINT_PICKUPS) return `${NAME[kind]}!`;
  return `${NAME[kind]}! ${input === 'keys' ? 'Press Space' : 'Tap USE'} ${WHAT[kind]}`;
}
