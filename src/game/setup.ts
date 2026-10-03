import { trackById } from '../config/tracks';
import { VEHICLES, vehicleById, type VehicleId } from '../config/vehicles';
import { buildTrack, sampleAt } from './track';
import { createProgress } from './race';
import { makeRacer, type RaceRuntime } from './runtime';
import { makePickups } from './items';
import { makeCritters } from './critters';
import { AI_NAMES } from './ai';

/** Everyone else on the grid: one of each vehicle except the one you picked, in a random order. */
function rivals(player: VehicleId): VehicleId[] {
  return VEHICLES.map(v => v.id).filter(v => v !== player).sort(() => Math.random() - 0.5);
}

export function makeRace(trackId: string, playerVehicle: VehicleId): { race: RaceRuntime; spawns: { x: number; y: number; z: number; yaw: number }[] } {
  const config = trackById(trackId);
  const track = buildTrack(config.control, 2, config.hills);
  const lineup = [...rivals(playerVehicle), playerVehicle];
  const names = [...AI_NAMES].sort(() => Math.random() - 0.5);
  const spawns: { x: number; y: number; z: number; yaw: number }[] = [];
  const racers = lineup.map((vid, k) => {
    // Two lanes, three rows, staggered; the player is last, at the back of the right lane.
    const row = Math.floor(k / 2), right = k % 2 === 1;
    const s = -8 - row * 12 - (right ? 5 : 0);
    const lane = (right ? 1 : -1) * config.halfWidth * 0.42;
    const at = sampleAt(track, s);
    const x = at.pos.x + at.right.x * lane, z = at.pos.z + at.right.z * lane;
    spawns.push({ x, y: at.pos.y, z, yaw: Math.atan2(-at.tangent.z, at.tangent.x) });
    const isPlayer = k === lineup.length - 1;
    const r = makeRacer(k, isPlayer ? 'You' : names[k], vehicleById(vid), isPlayer, createProgress(track, x, z));
    if (!isPlayer) r.ai = { lane, laneTarget: lane, skill: 0.9 + k * 0.035 + Math.random() * 0.03, itemDelay: 2, stuck: 0, reverseTime: 0 };
    return r;
  });
  let id = 1;
  const race: RaceRuntime = {
    config, track, racers, hazards: [], pickups: makePickups({ config, track }, () => id++), clock: 0, countdown: 3,
    phase: 'countdown', playerFinishedAt: null, nextId: 1000, puffs: [], critters: makeCritters({ config, track }),
  };
  return { race, spawns };
}
