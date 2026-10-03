import type { Hills } from '../game/track';

/**
 * Hand-built tracks. Each track is a closed loop through control points ([x, z] in metres,
 * driven in the listed order, starting at the first point). The road, kerbs, barriers,
 * colliders, racing line and scenery are all generated from this.
 */
export type SceneryZone = {
  /** Where along the lap (0..1) the zone starts and ends. */
  from: number;
  to: number;
  kind: 'market' | 'buildings' | 'danfoPark' | 'palms' | 'billboards';
  /** Which side of the road: -1 left, 1 right, 0 both. */
  side: -1 | 0 | 1;
};

export type TrackConfig = {
  id: string;
  name: string;
  blurb: string;
  control: [number, number][];
  hills?: Hills;
  /** Road half width, metres. */
  halfWidth: number;
  laps: number;
  /** Track distances (m) where a flyover crosses the road. */
  bridges: { s: number; name: string }[];
  /** Track distances (m) for item pickups (rows across the road). */
  items: number[];
  /** Goat and chicken crossing points: track distance, animal, how many. */
  critters?: { s: number; kind: 'goat' | 'chicken'; count: number }[];
  zones: SceneryZone[];
  /** Ground colour around the road (laterite). */
  ground: string;
};

export const TRACKS: TrackConfig[] = [
  {
    id: 'ojuelegba',
    name: 'Ojuelegba',
    blurb: 'Under the bridge, round the market, past the danfo park. Mind the agberos.',
    // A tight loop: Ojuelegba streets are narrow and crowded.
    control: [
      [-29, 0], [29, 0], [79, 0], [115, 6], [138, 26], [143, 56], [130, 81],
      [101, 92], [72, 85], [50, 95], [37, 117], [12, 130], [-22, 127],
      [-45, 108], [-53, 81], [-76, 66], [-101, 60], [-115, 42], [-108, 16], [-79, 3],
    ],
    // Rolling ups and downs, plus shorter humps and a ripple you feel through the suspension.
    hills: [[1.5, 1, 0.4], [0.85, 3, 1.3], [0.42, 7, 2.1], [0.2, 13, 0.7], [0.09, 23, 1.9], [0.045, 70, 0.3], [0.03, 113, 1.1]],
    halfWidth: 6.5,
    laps: 3,
    bridges: [{ s: 52, name: 'OJUELEGBA' }],
    items: [110, 300, 500],
    critters: [
      { s: 238, kind: 'goat', count: 3 },
      { s: 328, kind: 'chicken', count: 5 },
      { s: 405, kind: 'goat', count: 2 },
      { s: 548, kind: 'chicken', count: 4 },
      { s: 610, kind: 'goat', count: 2 },
    ],
    zones: [
      { from: 0.0, to: 0.12, kind: 'buildings', side: 0 },
      { from: 0.12, to: 0.3, kind: 'billboards', side: -1 },
      { from: 0.12, to: 0.32, kind: 'palms', side: 1 },
      { from: 0.32, to: 0.55, kind: 'market', side: 0 },
      { from: 0.55, to: 0.7, kind: 'buildings', side: 0 },
      { from: 0.7, to: 0.86, kind: 'danfoPark', side: 1 },
      { from: 0.7, to: 0.9, kind: 'palms', side: -1 },
      { from: 0.86, to: 1.0, kind: 'buildings', side: 0 },
    ],
    ground: '#a87d5c',
  },
];

export const trackById = (id: string) => TRACKS.find(t => t.id === id)!;
