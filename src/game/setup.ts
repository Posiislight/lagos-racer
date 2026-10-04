import type { RaceSetup, RaceSpec } from '../config/campaign';
import { randomDriver, type DriverId } from '../config/drivers';
import { trackOrDefault, trackFor } from '../config/tracks';
import { paintOf, vehicleById } from '../config/vehicles';
import { AI_NAMES } from './ai';
import { makeCritters } from './critters';
import { makePickups } from './items';
import { pickRivals, type Pick } from './lineup';
import { createMode } from './modes';
import { createProgress } from './race';
import { aiState, makeRacer, type RaceRuntime } from './runtime';
import { sampleAt } from './track';

type Spawn = { x: number; y: number; z: number; yaw: number };

/** Lap limit of a mode: elimination has none. */
const lapsOf = (mode: RaceSetup['mode']) => (mode.kind === 'elimination' ? Infinity : mode.laps);

/**
 * Everything a race starts from: the track, the grid, the rivals, the pickups and critters, and the
 * mode that decides how it ends. `spec` is the campaign race this is (null for a quick race).
 */
export function makeRace(setup: RaceSetup, player: Pick, playerDriver: DriverId, spec: RaceSpec | null = null): { race: RaceRuntime; spawns: Spawn[] } {
  const config = { ...trackOrDefault(setup.track), laps: lapsOf(setup.mode) };
  const track = trackFor(config);
  const duel = setup.mode.kind === 'duel';
  // A duel is you and Mama Put on the same row, she in your vehicle in another paint. Otherwise five
  // rivals (every vehicle at least once, all in different paints), then you at the back.
  const lineup: Pick[] = duel
    ? [{ vehicle: player.vehicle, paint: vehicleById(player.vehicle).paints.find(p => p.id !== player.paint)!.id }, player]
    : [...pickRivals(player, 5), player];
  const names = [...AI_NAMES].sort(() => Math.random() - 0.5);
  const spawns: Spawn[] = [];
  const racers = lineup.map(({ vehicle: vid, paint }, k) => {
    // Two lanes, staggered rows (one row in a duel); the player is last, at the back of the right lane.
    const row = duel ? 0 : Math.floor(k / 2), right = k % 2 === 1;
    const s = -8 - row * 12 - (right && !duel ? 5 : 0);
    const lane = (right ? 1 : -1) * config.halfWidth * 0.42;
    const at = sampleAt(track, s);
    const x = at.pos.x + at.right.x * lane, z = at.pos.z + at.right.z * lane;
    spawns.push({ x, y: at.pos.y, z, yaw: Math.atan2(-at.tangent.z, at.tangent.x) });
    const isPlayer = k === lineup.length - 1;
    const v = vehicleById(vid);
    const driver = isPlayer ? playerDriver : duel ? 'mamaput' : randomDriver(Math.random, setup.excludeDrivers);
    const r = makeRacer(k, isPlayer ? 'You' : duel ? 'Mama Put' : names[k], v, paintOf(v, paint), isPlayer, createProgress(track, x, z), driver);
    if (!isPlayer) {
      r.ai = setup.mode.kind === 'duel' ? aiState(lane, setup.mode.skill, 2, lane, true) : aiState(lane, 0.9 + k * 0.035 + Math.random() * 0.03, 2);
    }
    return r;
  });
  let id = 1;
  const race: RaceRuntime = {
    config, track, racers, hazards: [], pickups: makePickups({ config, track }, () => id++), clock: 0, countdown: 3,
    phase: 'countdown', playerFinishedAt: null, nextId: 1000, puffs: [], critters: makeCritters({ config, track }),
    mode: createMode(setup.mode), spec,
  };
  return { race, spawns };
}
