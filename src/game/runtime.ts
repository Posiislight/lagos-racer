import type { RapierRigidBody } from '@react-three/rapier';
import type { Object3D } from 'three';
import type { VehicleConfig } from '../config/vehicles';
import type { TrackConfig } from '../config/tracks';
import type { Track } from './track';
import { emptyControls, type Controls } from './input';
import type { RacerProgress } from './race';
import type { Critter } from './critters';

/**
 * Power-ups from the glowing orbs:
 * - fuel: a burst of speed for you;
 * - oil: crude oil dropped behind you, whoever drives over it goes slippery;
 * - juju: flies to the racer ahead of you and slows them down.
 */
export type ItemKind = 'fuel' | 'oil' | 'juju';

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
};

/** A car driven on another phone. Task 9 adds the snapshot buffer it is drawn from. */
export type RemoteCar = { dnf: boolean };

export type Racer = {
  /** Online this is the netId (grid index). */
  id: number;
  name: string;
  vehicle: VehicleConfig;
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
  /** Seconds of shaky handling left after running over a goat or chicken. */
  wobble: number;
  /** Seconds of immunity to oil, so a car that slows down in a slick can drive out of it. */
  immune: number;
  /** True while the vehicle is rubbing along the kerb wall (scraping slows you down). */
  scraping: boolean;
  /** Set by collisions this step: a knock that costs speed (0..1 of speed to lose). */
  knock: number;
  /** Seconds the car has been stuck; used to back it out or put it back on the road. */
  trouble: number;
  /** Request a respawn on the track at the next physics step. */
  respawn: boolean;
  ai: AIState | null;
};

export type Hazard = {
  id: number;
  kind: 'oil' | 'juju';
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
export type Puff = { x: number; y: number; z: number; age: number; color: 'juju' | 'fuel' };

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
  /** Room race hooks; null offline. */
  net: NetHooks | null;
};

/** What the race tells the room, and the room's clock. */
export interface NetHooks {
  /** Synced race clock (s), negative before the start. */
  now(): number;
  pickup(orb: number): void;
  use(h: Hazard): void;
  hit(hazardId: number, victim: number): void;
  finish(r: Racer): void;
}

let current: RaceRuntime | null = null;
export const getRace = () => current;
export const setRace = (r: RaceRuntime | null) => { current = r; };

export function makeRacer(id: number, name: string, vehicle: VehicleConfig, isPlayer: boolean, progress: RacerProgress): Racer {
  return {
    id, name, vehicle, isPlayer, kind: isPlayer ? 'local' : 'ai', owner: 0, remote: null, controls: emptyControls(), body: null, visual: null, progress,
    speed: 0, topBoost: 1, item: null, boost: 0, slip: 0, curse: 0, wobble: 0, immune: 0, scraping: false, knock: 0,
    trouble: 0, respawn: false, ai: null,
  };
}
