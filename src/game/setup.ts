import { trackById } from '../config/tracks';
import { VEHICLES, vehicleById, type VehicleId } from '../config/vehicles';
import type { GridEntry } from '../net/protocol';
import { buildTrack, sampleAt } from './track';
import { createProgress } from './race';
import { makeRacer, type AIState, type RaceRuntime, type Racer } from './runtime';
import { makePickups } from './items';
import { makeCritters } from './critters';
import { AI_NAMES } from './ai';
import { seededRandom } from './random';

export type Spawn = { x: number; y: number; z: number; yaw: number };

/** A room race: the server's grid, which slot is this phone, and the seed every phone shares. */
export type OnlineSetup = { grid: GridEntry[]; mySlot: number; seed: number };

/** Everyone else on the grid: one of each vehicle except the one you picked, in a random order. */
function rivals(player: VehicleId): VehicleId[] {
  return VEHICLES.map(v => v.id).filter(v => v !== player).sort(() => Math.random() - 0.5);
}

const aiState = (lane: number, k: number, rand: () => number): AIState =>
  ({ lane, laneTarget: lane, skill: 0.9 + k * 0.035 + rand() * 0.03, itemDelay: 2, stuck: 0, reverseTime: 0 });

export function makeRace(trackId: string, playerVehicle: VehicleId, online?: OnlineSetup): { race: RaceRuntime; spawns: Spawn[] } {
  const config = trackById(trackId);
  const track = buildTrack(config.control, 2, config.hills);
  const spawns: Spawn[] = [];
  /** Two lanes, three rows, staggered; grid position 0 is the front of the left lane. */
  const place = (k: number) => {
    const row = Math.floor(k / 2), right = k % 2 === 1;
    const s = -8 - row * 12 - (right ? 5 : 0);
    const lane = (right ? 1 : -1) * config.halfWidth * 0.42;
    const at = sampleAt(track, s);
    const x = at.pos.x + at.right.x * lane, z = at.pos.z + at.right.z * lane;
    spawns.push({ x, y: at.pos.y, z, yaw: Math.atan2(-at.tangent.z, at.tangent.x) });
    return { lane, progress: createProgress(track, x, z) };
  };

  let racers: Racer[];
  if (online) {
    const rand = seededRandom(online.seed);
    racers = [...online.grid].sort((a, b) => a.netId - b.netId).map(g => {
      const { lane, progress } = place(g.netId);
      const mine = g.slot === online.mySlot;
      const kind = !mine ? 'remote' : g.ai ? 'ai' : 'local';
      const r = makeRacer(g.netId, g.name, vehicleById(g.vehicle), kind === 'local', progress);
      r.kind = kind;
      r.owner = g.slot;
      // Every phone rolls every AI's skill in grid order, so they all agree whoever drives it.
      if (g.ai) r.ai = aiState(lane, g.netId, rand);
      return r;
    });
  } else {
    // The player is last, at the back of the right lane.
    const lineup = [...rivals(playerVehicle), playerVehicle];
    const names = [...AI_NAMES].sort(() => Math.random() - 0.5);
    racers = lineup.map((vid, k) => {
      const { lane, progress } = place(k);
      const isPlayer = k === lineup.length - 1;
      const r = makeRacer(k, isPlayer ? 'You' : names[k], vehicleById(vid), isPlayer, progress);
      if (!isPlayer) r.ai = aiState(lane, k, Math.random);
      return r;
    });
  }

  let id = 1;
  const race: RaceRuntime = {
    config, track, racers, hazards: [], pickups: makePickups({ config, track }, () => id++), clock: 0, countdown: 3,
    phase: 'countdown', playerFinishedAt: null,
    // Online, each phone numbers its own hazards from its own block so ids never clash.
    nextId: online ? online.mySlot * 100000 : 1000,
    puffs: [], critters: makeCritters({ config, track }, online ? seededRandom(online.seed) : undefined), net: null,
  };
  return { race, spawns };
}
