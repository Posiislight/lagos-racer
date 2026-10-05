// Disguised quick-race bots: look like players, appear gradually, and never clash with a human's name or paint.
import { VEHICLES, type VehicleId } from '../src/config/vehicles';
import { BOT_SLOT_BASE, GRID_SIZE } from '../src/net/protocol';

export const BOT_NAMES: readonly string[] = [
  'Tunde', 'Chidi_K', 'Femi99', 'Ngozi', 'Emeka', 'Bayo', 'Kelechi', 'Ife', 'Segun_X', 'Yinka',
  'Uche', 'Dayo', 'Chuka', 'Tobi', 'Wale', 'Kunle', 'Ada', 'Ibrahim', 'Musa', 'Sade',
  'Nazo', 'Jide', 'Obinna', 'Tola', 'Gbenga', 'Nneka', 'Lekan', 'Zainab', 'Damola', 'Efe',
  'Osas', 'Amaka', 'Seyi', 'Bukky', 'Chinedu', 'Folake', 'Tayo', 'Ikenna', 'Kemi', 'Dele',
  'Abiola', 'Toyin', 'Nonso', 'Rotimi', 'Hauwa', 'Biodun', 'Lagos Boy', 'Wahala', 'No Wahala', 'Omo Ibadan',
  'Sharp Guy', 'Baddest 01', 'Fast Fada', 'Oga Tunde', 'Area Boy 23', 'Small Chops', 'Jollof King', 'Pepe', 'Gbam', 'Eko Baba',
  'Kobo', 'Sabi Man',
];

export type BotView = { slot: number; name: string; vehicle: VehicleId; paint: string };
type HumanLook = { name: string; vehicle: VehicleId; paint: string };

const BOT_COUNT = GRID_SIZE - 1;
const APPEAR_MIN = 3000;
const APPEAR_MAX = 26000;

export class Roster {
  private names: string[];
  private looks: { vehicle: VehicleId; paint: string }[];
  private appear: number[];
  private skill: number[];

  constructor(random: () => number, startedAt: number) {
    const pool = [...BOT_NAMES];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    this.names = pool;
    this.looks = Array.from({ length: BOT_COUNT }, () => {
      const v = VEHICLES[Math.floor(random() * VEHICLES.length)];
      return { vehicle: v.id, paint: v.paints[Math.floor(random() * v.paints.length)].id };
    });
    this.appear = Array.from({ length: BOT_COUNT }, () => startedAt + APPEAR_MIN + random() * (APPEAR_MAX - APPEAR_MIN));
    this.skill = Array.from({ length: BOT_COUNT }, () => 0.85 + random() * 0.15);
  }

  visible(now: number, humans: HumanLook[]): BotView[] {
    const cap = Math.max(0, GRID_SIZE - humans.length);
    const taken = new Set(humans.map((h) => h.name.toLowerCase()));
    const bots: BotView[] = [];
    let next = BOT_COUNT; // spare pool names for replacements
    for (let i = 0; i < BOT_COUNT && bots.length < cap; i++) {
      if (this.appear[i] > now) continue;
      let name = this.names[i];
      while (taken.has(name.toLowerCase())) name = this.names[next++ % this.names.length];
      taken.add(name.toLowerCase());
      bots.push({ slot: BOT_SLOT_BASE + i, name, ...this.looks[i] });
    }
    if (now === Infinity) {
      const used = new Set(humans.map((h) => `${h.vehicle}/${h.paint}`));
      for (const b of bots) {
        if (used.has(`${b.vehicle}/${b.paint}`)) {
          const free = VEHICLES.find((v) => v.id === b.vehicle)!.paints.find(
            (p) => !used.has(`${b.vehicle}/${p.id}`) && !bots.some((o) => o !== b && o.vehicle === b.vehicle && o.paint === p.id),
          );
          if (free) b.paint = free.id;
        }
        used.add(`${b.vehicle}/${b.paint}`);
      }
    }
    return bots;
  }

  skills(): number[] {
    return [...this.skill];
  }
}
