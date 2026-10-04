import type { ModelId } from '../models';

/**
 * Every vehicle's stats, model and handling tuning in one place.
 * Model units are metres as built in the showroom; `scale` resizes the whole vehicle for the game.
 * Physics uses four raycast wheels on every vehicle (bikes and kekes too, for stability); the
 * okada leans and the keke tips visually instead.
 */
export type VehicleId = ModelId;

export type VehicleConfig = {
  id: VehicleId;
  name: string;
  /** Colour for menus and the minimap. */
  color: string;
  stats: { speed: number; handling: number; toughness: number };
  blurb: string;
  locked?: { coins: number };
  scale: number;
  /** Chassis box (model units): length, height, width, and the box centre height. */
  chassis: { length: number; height: number; width: number; centreY: number };
  /** Physics wheel layout (model units): front/rear axle x, half track z, radius. */
  wheels: { frontX: number; rearX: number; frontZ: number; rearZ: number; radius: number };
  tuning: {
    mass: number;
    /** Top speed on tarmac, m/s. */
    topSpeed: number;
    /** Acceleration from rest, m/s². */
    accel: number;
    /** Max front wheel angle at low speed, radians. */
    steer: number;
    /** Fraction of steering left at top speed (0..1). */
    steerAtSpeed: number;
    /** Tyre grip (Rapier friction slip). */
    grip: number;
    /** Rear grip multiplier while the handbrake is held (drifting). */
    driftGrip: number;
    brake: number;
    suspension: { rest: number; stiffness: number; compression: number; relaxation: number };
    /** Extra yaw help (rad/s per unit of steer) so slow, long vehicles still turn in. */
    yawAssist: number;
    /** How far the body visually leans into corners, radians at full lateral load. */
    lean: number;
    /** Multiplies the speed lost to crashes and wall scrapes (1 = normal, lower = tougher). */
    impact: number;
  };
  camera: { distance: number; height: number; lookAhead: number };
  horn: { freqs: number[]; pattern: number[] };
};

export const VEHICLES: VehicleConfig[] = [
  {
    id: 'okada', name: 'Red Okada', color: '#d0141a',
    stats: { speed: 9, handling: 9, toughness: 2 },
    blurb: 'Gold forks, angry LED eyes, madam side-saddle. Squeezes through gaps a cat would think twice about.',
    scale: 1.15,
    chassis: { length: 1.7, height: 0.7, width: 0.6, centreY: 0.75 },
    wheels: { frontX: 0.68, rearX: -0.63, frontZ: 0.3, rearZ: 0.3, radius: 0.31 },
    tuning: {
      mass: 260, topSpeed: 33, accel: 9.5, steer: 0.5, steerAtSpeed: 0.38, grip: 9, driftGrip: 0.45, brake: 9,
      suspension: { rest: 0.35, stiffness: 40, compression: 3, relaxation: 3.6 }, yawAssist: 0.8, lean: 0.55, impact: 1,
    },
    camera: { distance: 6.2, height: 2.4, lookAhead: 4 },
    horn: { freqs: [880, 1175], pattern: [0.09, 0.06, 0.09] },
  },
  {
    id: 'okada-blue', name: 'Blue Okada', color: '#0b55c4',
    stats: { speed: 9, handling: 9, toughness: 2 },
    blurb: 'The same race build in blue. Twins on the grid, rivals on the road.',
    scale: 1.15,
    chassis: { length: 1.7, height: 0.7, width: 0.6, centreY: 0.75 },
    wheels: { frontX: 0.68, rearX: -0.63, frontZ: 0.3, rearZ: 0.3, radius: 0.31 },
    tuning: {
      mass: 260, topSpeed: 33, accel: 9.5, steer: 0.5, steerAtSpeed: 0.38, grip: 9, driftGrip: 0.45, brake: 9,
      suspension: { rest: 0.35, stiffness: 40, compression: 3, relaxation: 3.6 }, yawAssist: 0.8, lean: 0.55, impact: 1,
    },
    camera: { distance: 6.2, height: 2.4, lookAhead: 4 },
    horn: { freqs: [988, 1319], pattern: [0.07, 0.05, 0.07, 0.05, 0.07] },
  },
  {
    id: 'keke', name: 'Keke Marwa', color: '#f5b400',
    stats: { speed: 5, handling: 6, toughness: 4 },
    blurb: 'Gone full rally: flared arches, roof wing, green underglow. Still corners on two wheels, just faster now.',
    scale: 1.05,
    chassis: { length: 2.2, height: 1.0, width: 1.2, centreY: 0.85 },
    wheels: { frontX: 1.04, rearX: -0.72, frontZ: 0.42, rearZ: 0.655, radius: 0.25 },
    tuning: {
      mass: 420, topSpeed: 27, accel: 7.2, steer: 0.48, steerAtSpeed: 0.42, grip: 7.5, driftGrip: 0.5, brake: 8,
      suspension: { rest: 0.32, stiffness: 34, compression: 2.6, relaxation: 3.2 }, yawAssist: 0.6, lean: -0.16, impact: 1,
    },
    camera: { distance: 6.6, height: 2.8, lookAhead: 4 },
    horn: { freqs: [520, 660], pattern: [0.12, 0.05, 0.12, 0.05, 0.12] },
  },
  {
    id: 'danfo', name: 'Danfo', color: '#f2a900',
    stats: { speed: 6, handling: 5, toughness: 7 },
    blurb: 'Slammed on fat wheels with a wing behind the roof rack. The conductor throws the power-ups.',
    scale: 0.95,
    chassis: { length: 4.6, height: 1.4, width: 1.8, centreY: 1.15 },
    wheels: { frontX: 1.5, rearX: -1.5, frontZ: 0.92, rearZ: 0.92, radius: 0.42 },
    tuning: {
      mass: 950, topSpeed: 28.5, accel: 6.6, steer: 0.45, steerAtSpeed: 0.45, grip: 8, driftGrip: 0.5, brake: 7,
      suspension: { rest: 0.36, stiffness: 30, compression: 2.4, relaxation: 3 }, yawAssist: 0.9, lean: -0.07, impact: 1,
    },
    camera: { distance: 9, height: 3.6, lookAhead: 5 },
    horn: { freqs: [392, 494], pattern: [0.25, 0.08, 0.4] },
  },
  {
    id: 'brt-blue', name: 'Blue BRT', color: '#0f86cf',
    stats: { speed: 4, handling: 3, toughness: 10 },
    blurb: 'The boss bus on gold alloys with a roof wing and quad pipes. Has its own lane. Will use yours too.',
    locked: { coins: 2_000_000 },
    scale: 0.72,
    chassis: { length: 11.4, height: 2.4, width: 2.5, centreY: 1.75 },
    wheels: { frontX: 3.3, rearX: -3.3, frontZ: 1.1, rearZ: 1.1, radius: 0.6 },
    tuning: {
      mass: 2400, topSpeed: 26, accel: 5.4, steer: 0.42, steerAtSpeed: 0.5, grip: 8.5, driftGrip: 0.55, brake: 6,
      suspension: { rest: 0.45, stiffness: 28, compression: 2.4, relaxation: 3 }, yawAssist: 1.3, lean: -0.04, impact: 1,
    },
    camera: { distance: 13, height: 5, lookAhead: 6 },
    horn: { freqs: [220, 277, 330], pattern: [0.5, 0.1, 0.5] },
  },
  {
    id: 'brt-red', name: 'Red BRT', color: '#d4141c',
    stats: { speed: 5, handling: 3, toughness: 9 },
    blurb: 'Same race-prepped tank in red. A bit quicker off the line, still impossible to push around.',
    locked: { coins: 3_000_000 },
    scale: 0.72,
    chassis: { length: 11.4, height: 2.4, width: 2.5, centreY: 1.75 },
    wheels: { frontX: 3.3, rearX: -3.3, frontZ: 1.1, rearZ: 1.1, radius: 0.6 },
    tuning: {
      mass: 2200, topSpeed: 27, accel: 6, steer: 0.42, steerAtSpeed: 0.5, grip: 8.5, driftGrip: 0.55, brake: 6,
      suspension: { rest: 0.45, stiffness: 28, compression: 2.4, relaxation: 3 }, yawAssist: 1.3, lean: -0.04, impact: 1,
    },
    camera: { distance: 13, height: 5, lookAhead: 6 },
    horn: { freqs: [233, 294, 349], pattern: [0.5, 0.1, 0.5] },
  },
];

export const vehicleById = (id: VehicleId) => VEHICLES.find(v => v.id === id)!;
