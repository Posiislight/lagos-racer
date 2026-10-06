import { TRACKS, trackFor } from '../src/config/tracks';
import { VEHICLES } from '../src/config/vehicles';
import { maxTopSpeed } from '../src/game/upgrades';
import { playerKey, weekStart } from '../src/game/leaderboard';
import type { SeedRow } from './leaderboard';

// Made-up nicknames, no real people or brands. All under the 16-letter nickname limit.
const NAMES = [
  'Chidi Speed', 'Tunde Danfo', 'Mama Nkechi', 'Baba Kekeman', 'Oga Bolt', 'Wale Jet', 'Ngozi Drift', 'Emeka Boost',
  'Sade Rush', 'Femi Turbo', 'Yinka Zoom', 'Kemi Flash', 'Tobi Racer', 'Ife Cruiser', 'Segun Wheel', 'Dayo Dash',
  'Chioma Fast', 'Bisi Lagos', 'Kunle Rider', 'Amaka Spin', 'Jide Okada', 'Lola Nitro', 'Ayo Gbam', 'Ebuka Rush',
  'Nneka Zoom', 'Seyi Blaze', 'Tayo Gear', 'Ada Swift', 'Bayo Keke', 'Uche Flyer', 'Funmi Race', 'Kayode Go',
  'Ronke Drift', 'Gbenga Max', 'Titi Spark', 'Dele Pace', 'Ireti Quick', 'Obi Wheelz', 'Zainab Run', 'Musa Express',
  'Hauwa Dash', 'Ibrahim Jet', 'Ope Slide', 'Tolu Rocket', 'Jumoke Fast', 'Kola Boost', 'Nonso Zoom', 'Lanre Rush',
];

/** A seeded racer drives at 55-85% of their ride's best top speed, so no time is faster than the referee would accept (it allows 160%). */
const PACE_MIN = 0.55;
const PACE_MAX = 0.85;
const MAX_POINTS = 60;

/**
 * Fake players for the boards: `count` nicknames, each with a vehicle, a time on every track and points for the week `now` falls in.
 * Times come from the track's length and the vehicle's speed, not from thin air.
 */
export function makeSeeds(random: () => number, now: number, count = 40): SeedRow[] {
  const pool = [...NAMES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const week = weekStart(now);
  const rows: SeedRow[] = [];
  for (const name of pool.slice(0, count)) {
    const vehicle = VEHICLES[Math.floor(random() * VEHICLES.length)];
    const points = 1 + Math.floor(random() * MAX_POINTS);
    for (const cfg of TRACKS) {
      const distance = cfg.laps * trackFor(cfg).length;
      const pace = PACE_MIN + random() * (PACE_MAX - PACE_MIN);
      rows.push({ key: playerKey(name), name, vehicle: vehicle.id, trackId: cfg.id, timeMs: Math.round(1000 * distance / (maxTopSpeed(vehicle) * pace)), week, points });
    }
  }
  return rows;
}
