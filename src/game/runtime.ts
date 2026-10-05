import type { RapierRigidBody } from '@react-three/rapier';
import type { Object3D } from 'three';
import type { Paint, VehicleConfig } from '../config/vehicles';
import type { TrackConfig } from '../config/tracks';
import type { Track } from './track';
import { emptyControls, type Controls } from './input';
import type { RacerProgress } from './race';
import type { Critter } from './critters';
import type { Mode } from './modes';
import type { RaceSpec } from '../config/campaign';
import type { SnapshotBuffer } from '../net/interpolation';
import { DEFAULT_DRIVER, type DriverId } from '../config/drivers';

/**
 * Power-ups from the glowing orbs:
 * - fuel: a burst of speed for you;
 * - oil: crude oil dropped behind you, whoever drives over it goes slippery;
 * - juju: flies to the racer ahead of you and slows them down;
 * - odeshi: a protective charm that blocks crude oil and juju for a few seconds.
 */
export type ItemKind = 'fuel' | 'oil' | 'juju' | 'odeshi';

export type AIState = {
  /** Preferred lateral offset from the centre line (m), drifts slowly for variety. */
  lane: number;
  laneTarget: number;
  /** 0.85..1.05 multiplier on target speed: how good this driver is. */
  skill: number;
  /** Seconds until the AI uses its item. */
  itemDelay: number;
  /** Seconds spent barely moving, for unsticking. */
  stuck: number;
  reverseTime: number;
  /** Seconds until the AI fires its special once the meter is full (-1: not started yet). */
  specialDelay: number;
  /** Seconds the special has been ready, so it can't wait forever for the perfect moment. */
  specialWait: number;
  /** Whether this AI may use its driver special at all (only Mama Put in the duel does). */
  special: boolean;
  /** Extra lateral offset (m) on the line it aims at: a Quick race bot's gentle wobble (see `humanize`); 0 otherwise. */
  offset: number;
  /** The human-ness layer of a Quick race bot, made on first use; null for every other AI. */
  human: HumanState | null;
};

/** What a Quick race bot's human-ness layer remembers between frames (see `humanize` in ai.ts). */
export type HumanState = {
  /** Seconds after the green light before it puts its foot down. */
  startDelay: number;
  /** Lane wobble: size (m), phase and rate (rad/s) of a slow sway across its lane. */
  amp: number;
  phase: number;
  rate: number;
  /** Seconds left of the current mistake (0: none), and which kind it is. */
  mistake: number;
  mistakeKind: 'lift' | 'wide';
  /** Race clock time before which no new mistake starts. */
  nextMistake: number;
  /** The item it is holding, how long it has held it, how long it means to, and whether the AI already asked to use it. */
  item: ItemKind | null;
  held: number;
  hold: number;
  wants: boolean;
};

/** A car driven on another phone, drawn from its snapshot buffer. */
export type RemoteCar = { buffer: SnapshotBuffer; dnf: boolean };

export const aiState = (lane: number, skill: number, itemDelay = 2, laneTarget = lane, special = false): AIState =>
  ({ lane, laneTarget, skill, itemDelay, stuck: 0, reverseTime: 0, specialDelay: -1, specialWait: 0, special, offset: 0, human: null });

export type Racer = {
  /** Online this is the netId (grid index). */
  id: number;
  name: string;
  vehicle: VehicleConfig;
  paint: Paint;
  isPlayer: boolean;
  /** Who drives it: this phone's player, this phone's AI, or another phone. */
  kind: 'local' | 'ai' | 'remote';
  /** Slot of the phone that drives it; 0 offline. */
  owner: number;
  remote: RemoteCar | null;
  controls: Controls;
  body: RapierRigidBody | null;
  /** Interpolated visual group (use for cameras and effects). */
  visual: Object3D | null;
  progress: RacerProgress;
  /** Signed forward speed, m/s. */
  speed: number;
  item: ItemKind | null;
  /** Multiplier on top speed (AI catch-up). */
  topBoost: number;
  /** Seconds of fuel boost left. */
  boost: number;
  /** Seconds of crude-oil slipperiness left (tyres lose grip, the vehicle slides about). */
  slip: number;
  /** Seconds of juju slowdown left. */
  curse: number;
  /** Seconds of odeshi left: oil and juju do nothing to you while it lasts. */
  shield: number;
  /** Seconds of shaky handling left after running over a goat or chicken. */
  wobble: number;
  /** Seconds of immunity to oil, so a car that slows down in a slick can drive out of it. */
  immune: number;
  /** True while the vehicle is rubbing along the kerb wall (scraping slows you down). */
  scraping: boolean;
  /** Set by collisions this step: a knock that costs speed (0..1 of speed to lose). */
  knock: number;
  /** Sideways shove from bumping another vehicle (m/s); fades quickly, exempt from the arcade grip. */
  bump: { x: number; z: number };
  /** Ids of the racers this one is touching right now. */
  touching: Set<number>;
  /** Contact normal (horizontal) for each racer in `touching`, from the collision that started the contact. */
  contactNormal: Map<number, { x: number; z: number }>;
  /** Seconds the car has been stuck; used to back it out or put it back on the road. */
  trouble: number;
  /** How many times this racer has been put back on the road (play-test metric). */
  respawns: number;
  /** Request a respawn on the track at the next physics step. */
  respawn: boolean;
  /** Race clock time this racer was knocked out (elimination mode), or null while still in. */
  outAt: number | null;
  /** The chosen driver: decides which special power this racer has. */
  driver: DriverId;
  /** Special meter, 0..1; at 1 the special can be fired. */
  charge: number;
  /** Seconds of Push Squad left. */
  push: number;
  /** Seconds of cough left (from a Pepper Soup patch). */
  cough: number;
  /** Seconds of Pepper Soup Trail still to drop. */
  trail: number;
  /** Metres travelled since the last soup patch, and patches dropped by this use. */
  trailDist: number;
  trailCount: number;
  ai: AIState | null;
};

export type Hazard = {
  id: number;
  kind: 'oil' | 'juju' | 'soup';
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  owner: number;
  /** For juju: the racer it is flying at. */
  target: number | null;
  /** Seconds left before it disappears. */
  life: number;
  /** Seconds before it can affect its owner. */
  armed: number;
  /** Road height under the hazard. */
  ground: number;
};

export type Pickup = { id: number; kind: ItemKind; x: number; y: number; z: number; s: number; respawn: number };

/** A short-lived puff where something hit: juju's purple smoke, oil splashes. */
export type Puff = { x: number; y: number; z: number; age: number; color: 'juju' | 'fuel' | 'odeshi' | 'steam' };

export type RaceRuntime = {
  config: TrackConfig;
  track: Track;
  racers: Racer[];
  hazards: Hazard[];
  pickups: Pickup[];
  /** Race clock (s) from the green light. */
  clock: number;
  countdown: number;
  phase: 'countdown' | 'racing' | 'finished';
  /** Clock time when the player finished. */
  playerFinishedAt: number | null;
  nextId: number;
  puffs: Puff[];
  critters: Critter[];
  /** How this race ends and who is ranked where (laps, elimination or duel). */
  mode: Mode;
  /** The campaign race being run, or null for a quick race. */
  spec: RaceSpec | null;
  /** Room race hooks; null offline. */
  net: NetHooks | null;
  /** A Quick room: this phone's AI cars are disguised bots and drive like people (`humanize`). */
  humanize: boolean;
};

/** What the race tells the room, and the room's clock. */
export interface NetHooks {
  /** True once the room has announced the start time. */
  readonly started: boolean;
  /** Synced race clock (s), negative before the start. */
  now(): number;
  /** Called every frame: sends this phone's cars to the room when a snapshot is due. */
  update(race: RaceRuntime): void;
  pickup(orb: number): void;
  use(h: Hazard): void;
  hit(hazardId: number, victim: number): void;
  finish(r: Racer): void;
}

/** Rapier's RigidBodyType values (as @react-three/rapier maps them), so game code needn't import Rapier itself. */
const DYNAMIC = 0, KINEMATIC_POSITION = 2;

/**
 * Who moves this body: our physics (a car this phone drives) or the snapshots of another phone (kinematic). A car
 * handed to this phone mid-race switches here rather than through the RigidBody's type prop, which would also put
 * the body back where it was last drawn.
 */
export function setBodyDriven(b: RapierRigidBody, remote: boolean) {
  const type = remote ? KINEMATIC_POSITION : DYNAMIC;
  if (b.bodyType() !== type) b.setBodyType(type, true);
  b.enableCcd(!remote);
}

let current: RaceRuntime | null = null;
export const getRace = () => current;
export const setRace = (r: RaceRuntime | null) => { current = r; };

export function makeRacer(id: number, name: string, vehicle: VehicleConfig, paint: Paint, isPlayer: boolean, progress: RacerProgress, driver: DriverId = DEFAULT_DRIVER): Racer {
  return {
    id, name, vehicle, paint, isPlayer, kind: isPlayer ? 'local' : 'ai', owner: 0, remote: null, controls: emptyControls(), body: null, visual: null, progress,
    speed: 0, topBoost: 1, item: null, boost: 0, slip: 0, curse: 0, shield: 0, wobble: 0, immune: 0, scraping: false, knock: 0,
    bump: { x: 0, z: 0 }, touching: new Set(), contactNormal: new Map(), trouble: 0, respawns: 0, respawn: false, outAt: null,
    driver, charge: 0, push: 0, cough: 0, trail: 0, trailDist: 0, trailCount: 0, ai: null,
  };
}
