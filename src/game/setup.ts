import { trackById, trackFor } from '../config/tracks';
import { paintOf, vehicleById } from '../config/vehicles';
import type { GridEntry } from '../net/protocol';
import { SnapshotBuffer } from '../net/interpolation';
import { sampleAt } from './track';
import { createProgress } from './race';
import { DEFAULT_DRIVER, randomDriver, type DriverId } from '../config/drivers';
import { aiState, makeRacer, type RaceRuntime, type Racer } from './runtime';
import { makePickups } from './items';
import { makeCritters } from './critters';
import { AI_NAMES } from './ai';
import { seededRandom } from './random';
import { pickRivals, type Pick } from './lineup';

export type Spawn = { x: number; y: number; z: number; yaw: number };

/** A room race: the server's grid, which slot is this phone, and the seed every phone shares. */
export type OnlineSetup = { grid: GridEntry[]; mySlot: number; seed: number };

const rivalAI = (lane: number, k: number, rand: () => number) => aiState(lane, 0.9 + k * 0.035 + rand() * 0.03, 2);

export function makeRace(trackId: string, player: Pick, playerDriver: DriverId, online?: OnlineSetup): { race: RaceRuntime; spawns: Spawn[] } {
  const config = trackById(trackId);
  const track = trackFor(config);
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
      const v = vehicleById(g.vehicle);
      const r = makeRacer(g.netId, g.name, v, paintOf(v, g.paint), kind === 'local', progress, kind === 'local' ? playerDriver : DEFAULT_DRIVER);
      r.kind = kind;
      r.owner = g.slot;
      if (kind === 'remote') r.remote = { buffer: new SnapshotBuffer(), dnf: false };
      // Every phone rolls every AI's skill in grid order, so they all agree whoever drives it.
      if (g.ai) r.ai = rivalAI(lane, g.netId, rand);
      return r;
    });
  } else {
    // Five rivals (every vehicle at least once, all in different paints), then you at the back of the right lane.
    const lineup = [...pickRivals(player, 5), player];
    const names = [...AI_NAMES].sort(() => Math.random() - 0.5);
    racers = lineup.map(({ vehicle: vid, paint }, k) => {
      const { lane, progress } = place(k);
      const isPlayer = k === lineup.length - 1;
      const v = vehicleById(vid);
      const r = makeRacer(k, isPlayer ? 'You' : names[k], v, paintOf(v, paint), isPlayer, progress, isPlayer ? playerDriver : randomDriver());
      if (!isPlayer) r.ai = rivalAI(lane, k, Math.random);
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
