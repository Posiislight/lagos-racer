import { applyProfile, buildTrack, type Hills, type HeightProfile, type Track } from '../game/track.ts';
import { axisDistance, outAndBack } from '../game/outAndBack.ts';
import { buildBranch, type Shortcut } from '../game/shortcuts.ts';
import { OJUELEGBA_AXIS, OJUELEGBA_START } from './ojuelegbaAxis.ts';
import { IKORODU_AXIS, IKORODU_START } from './ikoroduAxis.ts';
import { THIRD_MAINLAND_CONTROL, THIRD_MAINLAND_HEIGHTS } from './thirdMainland.ts';

export type ZoneKind =
  | 'market' | 'buildings' | 'danfoPark' | 'palms' | 'billboards'
  | 'tejuosho' | 'petrol' | 'danfoRow' | 'church' | 'sportsShops'
  // Ikorodu Garage
  | 'lowrise' | 'beach' | 'hospital' | 'mosque' | 'hoarding' | 'kfc' | 'tailoring' | 'tanker' | 'yellowBlock' | 'kekeRow';

/**
 * A stretch of scenery. Either by lap fraction (0..1) with a side of the road (-1 left, 1 right,
 * 0 both), or, on tracks laid along a real road, by distance along the road's axis (metres from its
 * east end) and which side of the street it is on.
 */
export type SceneryZone =
  | { kind: ZoneKind; from: number; to: number; side: -1 | 0 | 1 }
  | { kind: ZoneKind; road: [number, number]; street: 'north' | 'south' };

/**
 * What a place looks like, apart from its road: sky, haze, light, the backdrop at the horizon and, for
 * tracks over water, the lagoon itself. Every track has one; `STREET` is the dusty inner-city default.
 */
export type Setting = {
  /** Sky gradient from the zenith down to the horizon: five colours. */
  sky: [string, string, string, string, string];
  fog: string;
  /** Hemisphere light: sky colour, ground bounce, and the sun's colour. */
  light: { sky: string; ground: string; sun: string };
  /** The painted ring at the horizon: Lagos rooftops, or the far shore across the water. */
  backdrop: 'city' | 'shore';
  water?: Water;
};

/** A lagoon: a water surface, with land only where the track says so (everywhere else is water). */
export type Water = {
  /** Height of the surface, relative to the start line. */
  level: number;
  colour: string;
  land: {
    /** Round patches of land: [x, z, radius] in metres. */
    discs: [number, number, number][];
    /** Land along the road for part of the lap: [from lap distance, to lap distance, half width of the bank]. */
    banks: [number, number, number][];
  };
};

export const STREET: Setting = {
  sky: ['#2f7fd0', '#6fb0e6', '#e9e0cc', '#f1e4c9', '#e8d6b6'],
  fog: '#efdcbc',
  light: { sky: '#dbeeff', ground: '#9a6b48', sun: '#fff1dc' },
  backdrop: 'city',
};

/** Clear blue sky and cool haze over open water. */
const LAGOON: Setting = {
  sky: ['#1b73d4', '#5cb4ee', '#cde8f6', '#ecf6fb', '#d7ecf5'],
  fog: '#d5e8f2',
  light: { sky: '#e8f4ff', ground: '#4f8aa6', sun: '#fff6e6' },
  backdrop: 'shore',
  water: {
    level: -3,
    colour: '#2f9cb0',
    land: {
      discs: [[-70, 760, 130]],
      // The mainland street at the start, the island end, and the mainland street home.
      banks: [[0, 330, 90], [1620, 1860, 100], [2290, 2640, 90]],
    },
  },
};

export type TrackConfig = {
  id: string;
  name: string;
  blurb: string;
  /** Closed loop of [x, z] points (metres), driven in order from the start line. */
  control: [number, number][];
  /** For tracks along a real road: its centreline, east to west (see outAndBack). */
  axis?: [number, number][];
  /** Two legs side by side with a median between them. redWhite: axis range where its kerb is red and white. barrier: axis range where it is a low concrete wall. */
  median?: { width: number; redWhite?: [number, number]; barrier?: [number, number] };
  hills?: Hills;
  /** Ramps and bridge decks: the road's height along the lap (see HeightProfile). Used instead of hills. */
  heights?: HeightProfile;
  /** Sky, light, backdrop and water. Defaults to STREET. */
  setting?: Setting;
  /** Side roads that leave the main road and rejoin it (see shortcuts.ts). */
  shortcuts?: Shortcut[];
  /** Where the road layout comes from, if it is a real road (shown in the menu). Hand-drawn tracks have none. */
  credit?: string;
  /** Text on the start gantry. Defaults to the track's name. */
  banner?: string;
  /** What the hills follow: lap distance (default) or world x (out-and-back roads). */
  hillsAxis?: 'lap' | 'x' | 'road';
  /** Road half width, metres. */
  halfWidth: number;
  laps: number;
  /** Flyovers crossing the road, by lap distance (s) or axis distance (road); width is the deck's depth along the road. */
  bridges: { s?: number; road?: number; name: string; width?: number }[];
  /** Green direction signs over the outbound leg, by axis distance. */
  signs?: { road: number; text: string }[];
  /** Track distances (m) for item pickups (rows across the road). */
  items: number[];
  /** Goat and chicken crossing points: track distance, animal, how many. */
  critters?: { s: number; kind: 'goat' | 'chicken'; count: number }[];
  zones: SceneryZone[];
  /** 'real': draw the real signs listed in src/config/signs (lettering only). Default 'generic': no real names. */
  signage?: 'real' | 'generic';
  /** Raised islands inside a U-turn, centred this far along the axis (a roundabout). */
  islands?: { road: number; radius: number; statue?: boolean; /** Buildings beyond the roundabout, seen across it. */ backdrop?: boolean }[];
  /** Axis ranges whose road shape is constructed, not taken from the map. track-report lists them. */
  invented?: { road: [number, number]; why: string }[];
  /** Ground colour around the road (laterite). */
  ground: string;
};

const HALF_WIDTH = 6.5, MEDIAN = 1.6;
// The start line sits just west of the Tejuosho market (from your Street View link), far enough in that
// the whole grid is on the straight, clear of the east U-turn's taper.
const START = OJUELEGBA_START + 47.4;
const north = (kind: ZoneKind, a: number, b: number): SceneryZone => ({ kind, road: [a, b], street: 'north' });
const south = (kind: ZoneKind, a: number, b: number): SceneryZone => ({ kind, road: [a, b], street: 'south' });

const IKORODU_LENGTH = IKORODU_AXIS.reduce((L, p, i) => (i ? L + Math.hypot(p[0] - IKORODU_AXIS[i - 1][0], p[1] - IKORODU_AXIS[i - 1][1]) : 0), 0);

export const TRACKS: TrackConfig[] = [
  {
    id: 'ojuelegba',
    name: 'Ojuelegba',
    blurb: 'The real Ojuelegba Road: Tejuosho market to under the bridge and back. Mind the agberos.',
    // West along the north carriageway, U-turn under the Western Avenue bridge, back east on the south one.
    // U-turns 18 m round the centre line, so a BRT and another vehicle can get round side by side.
    control: outAndBack(OJUELEGBA_AXIS, { gap: 2 * HALF_WIDTH + MEDIAN, turnRadius: 18, splay: 50, startAt: START }),
    axis: OJUELEGBA_AXIS,
    median: { width: MEDIAN, redWhite: [80, 118] },
    // The real road is flat; keep gentle rolling and a ripple you feel in the suspension.
    hills: [[0.45, 2, 0.4], [0.25, 5, 1.3], [0.08, 13, 2.1]],
    hillsAxis: 'road',
    halfWidth: HALF_WIDTH,
    laps: 3,
    // The Western Avenue deck covers the west U-turn.
    bridges: [{ road: 362, name: 'OJUELEGBA', width: 34 }],
    signs: [{ road: 327, text: 'SURULERE  ·  OSHODI  ·  YABA' }],
    items: [43, 213, 403, 573],
    critters: [
      { s: 133, kind: 'goat', count: 3 },
      { s: 283, kind: 'chicken', count: 5 },
      { s: 473, kind: 'goat', count: 2 },
      { s: 643, kind: 'chicken', count: 4 },
    ],
    // What's really there (Street View walk, 3 October), converted to axis metres at 0.38 scale.
    zones: [
      north('buildings', 20, 80), north('petrol', 82, 100), north('market', 100, 118), north('buildings', 118, 187),
      north('church', 190, 205), north('buildings', 205, 240), north('sportsShops', 240, 324), north('market', 331, 356),
      south('tejuosho', 20, 80), south('danfoRow', 80, 118), south('buildings', 118, 187), south('market', 187, 240),
      south('buildings', 240, 324), south('market', 331, 356),
    ],
    ground: '#a87d5c',
    credit: '© OpenStreetMap contributors',
  },
  {
    id: 'third-mainland',
    name: 'Third Mainland Bridge',
    blurb: 'From the mainland up onto the bridge, across the lagoon, round the island and home through the water village.',
    // A hand-drawn journey (see thirdMainland.ts): about 2.6 km a lap.
    control: THIRD_MAINLAND_CONTROL,
    heights: THIRD_MAINLAND_HEIGHTS,
    setting: LAGOON,
    banner: '3RD MAINLAND BRIDGE',
    // Wide and forgiving, with solid concrete parapets all the way.
    halfWidth: 7.5,
    laps: 2,
    bridges: [],
    // Rows of pickups every 180 m or so, kept off the ramps' foot and the hairpin.
    items: [160, 340, 520, 700, 880, 1060, 1240, 1420, 1600, 1780, 1960, 2140, 2320, 2500],
    critters: [
      { s: 120, kind: 'chicken', count: 4 },
      { s: 2420, kind: 'goat', count: 2 },
      { s: 2540, kind: 'chicken', count: 5 },
    ],
    // Scenery only where the road is on land; the span and the causeway have their own props.
    zones: [
      { kind: 'market', from: 0.012, to: 0.06, side: 1 }, { kind: 'buildings', from: 0.012, to: 0.1, side: -1 },
      { kind: 'buildings', from: 0.06, to: 0.11, side: 1 },
      { kind: 'danfoPark', from: 0.89, to: 0.95, side: 1 }, { kind: 'palms', from: 0.89, to: 0.99, side: -1 },
      { kind: 'billboards', from: 0.95, to: 0.99, side: 1 },
      { kind: 'petrol', from: 0.675, to: 0.7, side: 1 }, { kind: 'palms', from: 0.672, to: 0.72, side: -1 },
    ],
    ground: '#cdb98a',
  },
  {
    id: 'ikorodu',
    name: 'Ikorodu Garage',
    blurb: 'From the General Hospital to the garage roundabout and back. Mind the okadas.',
    // Axis runs hospital to roundabout, so street 'north' is the right-hand (outbound) side going to the roundabout.
    // U-turns 16 m round the centre line (the BRT needs 12 m at the very least, but AI BRTs and kekes got stuck at 13 m).
    control: outAndBack(IKORODU_AXIS, { gap: 2 * HALF_WIDTH + MEDIAN, turnRadius: 16, splay: 40, startAt: IKORODU_START }),
    axis: IKORODU_AXIS,
    // The last 390 real metres to the roundabout are a dual carriageway with a concrete barrier down the middle.
    median: { width: MEDIAN, barrier: [IKORODU_LENGTH - 117, IKORODU_LENGTH] },
    hills: [[0.3, 2, 0.4], [0.18, 5, 1.3], [0.06, 13, 2.1]],
    hillsAxis: 'road',
    halfWidth: HALF_WIDTH,
    laps: 3,
    bridges: [],
    items: [60, 260, 520, 720],
    critters: [
      { s: 160, kind: 'goat', count: 3 },
      { s: 360, kind: 'chicken', count: 5 },
      { s: 620, kind: 'goat', count: 2 },
      { s: 820, kind: 'chicken', count: 4 },
    ],
    // Distances along the axis from the hospital; the real stops are in the spec (metres south of the roundabout x 0.3).
    // North is the right-hand side going to the roundabout (east), south the left (west).
    zones: [
      north('hospital', 8, 50), south('hospital', 8, 50),
      north('beach', 50, 178), south('beach', 50, 178),
      north('lowrise', 178, 246), north('kfc', 246, 261), north('tailoring', 262, 277), north('lowrise', 277, 297),
      north('kekeRow', 297, 335), north('mosque', IKORODU_LENGTH - 75, IKORODU_LENGTH - 40), north('lowrise', IKORODU_LENGTH - 40, IKORODU_LENGTH - 30),
      north('hoarding', IKORODU_LENGTH - 30, IKORODU_LENGTH - 14),
      south('tanker', 176, 190), south('lowrise', 190, 288), south('yellowBlock', 288, 302),
      south('lowrise', 302, IKORODU_LENGTH - 75), south('petrol', IKORODU_LENGTH - 75, IKORODU_LENGTH - 45), south('lowrise', IKORODU_LENGTH - 45, IKORODU_LENGTH - 12),
    ],
    // The real ring is about 5.4 m in radius at this scale, too tight for the BRT; the road round it is 16 m.
    signage: 'real',
    credit: '© OpenStreetMap contributors',
    islands: [{ road: IKORODU_LENGTH, radius: 9.2, statue: true, backdrop: true }],
    invented: [{ road: [0, 20], why: 'OSM shows only a 34 m service road inside the hospital gate; the U-turn there is a constructed 16 m turning circle in the forecourt' }],
    ground: '#a87d5c',
  },
];

export const trackById = (id: string) => TRACKS.find(t => t.id === id)!;
/** The track with this id, or Ojuelegba for an id that no longer exists (an old save). */
export const trackOrDefault = (id: string) => TRACKS.find(t => t.id === id) ?? TRACKS[0];

/** The sampled track for a config: its loop, its hills, and what the hills follow. */
export function trackFor(cfg: TrackConfig): Track {
  const along = cfg.hillsAxis === 'road' && cfg.axis
    ? (x: number, z: number) => axisDistance(cfg.axis!, x, z)
    : cfg.hillsAxis === 'x' ? 'x' : 'lap';
  const track = buildTrack(cfg.control, 2, cfg.hills, along);
  if (cfg.heights) applyProfile(track, cfg.heights);
  if (cfg.shortcuts?.length) track.branches = cfg.shortcuts.map(sc => buildBranch(track, sc, cfg.halfWidth));
  return track;
}
