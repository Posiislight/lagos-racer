/**
 * The drivers you can pick, and every number behind their special powers, in one place so tuning is easy.
 * A driver is chosen separately from the vehicle; the vehicle models seat whoever is chosen.
 */
export type DriverId = 'moshood' | 'mamaput';
export type SpecialKind = 'push' | 'soup';

export type DriverConfig = {
  id: DriverId;
  name: string;
  role: string;
  blurb: string;
  special: { kind: SpecialKind; name: string; /** Seconds of racing to fill the meter. */ chargeTime: number };
  /** Not pickable until this campaign race (an id from `CHAPTER_1`) has been cleared. */
  locked?: { race: string };
};

export const DRIVERS: DriverConfig[] = [
  {
    id: 'moshood', name: 'Moshood', role: 'Agbero',
    blurb: 'Angry, restless street tout. When his meter is full, his boys run behind him and shove.',
    special: { kind: 'push', name: 'Push Squad', chargeTime: 30 },
  },
  {
    id: 'mamaput', name: 'Mama Put', role: 'Food seller',
    blurb: 'Stern and not to be argued with. She leaves a long trail of scalding pepper soup behind her.',
    special: { kind: 'soup', name: 'Pepper Soup Trail', chargeTime: 30 },
    locked: { race: 'campaign-1-4' },
  },
];

export const DEFAULT_DRIVER: DriverId = 'moshood';

export const driverById = (id: DriverId) => DRIVERS.find(d => d.id === id)!;

/** What each special does, in seconds, metres and multipliers. */
export const SPECIALS = {
  push: { duration: 4, topSpeed: 1.35, accel: 2.6 },
  soup: {
    /** Seconds the trail keeps dropping patches. */
    duration: 5,
    /** Metres travelled between patches. */
    spacing: 3.5,
    /** Seconds a patch stays on the road. */
    patchLife: 9,
    /** Patch radius (m). */
    radius: 2,
    /** Most patches one use can drop. */
    maxPatches: 40,
    /** Seconds of cough (before the toughness scaling). */
    cough: 2.4,
    /** Top speed and acceleration multiplier while coughing. */
    coughSpeed: 0.7,
    /** Seconds of immunity after the cough ends, so a racer can drive out. */
    immunity: 1,
  },
} as const;

/** A driver id from anything (a saved game can hold junk); unknown values become the default driver. */
export function sanitizeDriver(v: unknown): DriverId {
  return DRIVERS.some(d => d.id === v) ? (v as DriverId) : DEFAULT_DRIVER;
}

/** A random driver, skipping `exclude` (unless that would leave nobody, then it is ignored). */
export function randomDriver(rand: () => number = Math.random, exclude: DriverId[] = []): DriverId {
  const left = DRIVERS.filter(d => !exclude.includes(d.id));
  const pool = left.length ? left : DRIVERS;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))].id;
}
