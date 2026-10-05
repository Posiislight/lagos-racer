import type { RaceSetup, RaceSpec } from '../config/campaign';
import { DEFAULT_DRIVER, randomDriver, type DriverId } from '../config/drivers';
import { trackOrDefault, trackFor } from '../config/tracks';
import { paintOf, vehicleById } from '../config/vehicles';
import type { GridEntry } from '../net/protocol';
import { SnapshotBuffer } from '../net/interpolation';
import { AI_NAMES, botAI } from './ai';
import { makeCritters } from './critters';
import { makePickups } from './items';
import { pickRivals, type Pick } from './lineup';
import { createMode } from './modes';
import { createProgress } from './race';
import { seededRandom } from './random';
import { aiState, makeRacer, type RaceRuntime, type Racer } from './runtime';
import { sampleAt } from './track';

export type Spawn = { x: number; y: number; z: number; yaw: number };

/**
 * A room race: the server's grid, which slot is this phone, the seed every phone shares, and whether it is a Quick
 * room (whose AI cars are disguised bots that drive like people).
 */
export type OnlineSetup = { grid: GridEntry[]; mySlot: number; seed: number; quick: boolean };

/** Lap limit of a mode: elimination has none. */
const lapsOf = (mode: RaceSetup['mode']) => (mode.kind === 'elimination' ? Infinity : mode.laps);

const rivalAI = (lane: number, k: number, rand: () => number) => aiState(lane, 0.9 + k * 0.035 + rand() * 0.03, 2);

/**
 * Everything a race starts from: the track, the grid, the rivals, the pickups and critters, and the
 * mode that decides how it ends. `spec` is the campaign race this is (null for a quick race); `online`
 * lays the grid out from a room's grid instead of picking rivals.
 */
export function makeRace(setup: RaceSetup, player: Pick, playerDriver: DriverId, spec: RaceSpec | null = null, online?: OnlineSetup): { race: RaceRuntime; spawns: Spawn[] } {
  const config = { ...trackOrDefault(setup.track), laps: lapsOf(setup.mode) };
  const track = trackFor(config);
  const duel = setup.mode.kind === 'duel' && !online;
  const spawns: Spawn[] = [];
  /** Two lanes, staggered rows (one row in a duel); grid position 0 is the front of the left lane. */
  const place = (k: number) => {
    const row = duel ? 0 : Math.floor(k / 2), right = k % 2 === 1;
    const s = -8 - row * 12 - (right && !duel ? 5 : 0);
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
      // Only the phone driving an AI car gives it a skill. In a friends' room every phone sees the AI flags and rolls
      // them in grid order, so they agree; a Quick room's bots get a skill in the bot range on their owner's phone.
      if (g.ai) r.ai = online.quick ? botAI(lane, rand) : rivalAI(lane, g.netId, rand);
      return r;
    });
  } else {
    // A duel is you and Mama Put on the same row, she in your vehicle in another paint. Otherwise five
    // rivals (every vehicle at least once, all in different paints), then you at the back.
    const lineup: Pick[] = duel
      ? [{ vehicle: player.vehicle, paint: vehicleById(player.vehicle).paints.find(p => p.id !== player.paint)!.id }, player]
      : [...pickRivals(player, 5), player];
    const names = [...AI_NAMES].sort(() => Math.random() - 0.5);
    racers = lineup.map(({ vehicle: vid, paint }, k) => {
      const { lane, progress } = place(k);
      const isPlayer = k === lineup.length - 1;
      const v = vehicleById(vid);
      const driver = isPlayer ? playerDriver : duel ? 'mamaput' : randomDriver(Math.random, setup.excludeDrivers);
      const r = makeRacer(k, isPlayer ? 'You' : duel ? 'Mama Put' : names[k], v, paintOf(v, paint), isPlayer, progress, driver);
      if (!isPlayer) {
        r.ai = setup.mode.kind === 'duel' ? aiState(lane, setup.mode.skill, 2, lane, true) : rivalAI(lane, k, Math.random);
      }
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
    mode: createMode(setup.mode), spec, humanize: online?.quick ?? false,
  };
  return { race, spawns };
}
