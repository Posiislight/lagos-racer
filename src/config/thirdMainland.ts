/**
 * Third Mainland Bridge: a hand-drawn journey, not the real road's surveyed centreline.
 * Metres, x east and z south, start line at the origin heading east.
 *
 *   1. Mainland street (Oworonshoki): market, danfo park, a left-right kink.
 *   2. The ramp: a long curl to the right that climbs onto the bridge.
 *   3. The main span: a long sweeping curve over the open lagoon, with an S in it.
 *   4. Island end: the deck swings round and drops down a curving ramp.
 *   5. The causeway home: a low road through the Makoko water village, with a chicane,
 *      then a hairpin out onto the mainland and back up the start straight.
 */
export const THIRD_MAINLAND_CONTROL: [number, number][] = [
  // The start straight on the mainland street, with a kink before the ramp.
  [0, 0], [110, 0], [204, -26], [289, -13],
  // Ramp: a long curl to the right that climbs.
  [366, 30], [412, 106], [416, 191],
  // Main span: swings out and back over the lagoon, then the long sweep to the island.
  [387, 276], [348, 353], [370, 429], [416, 497], [412, 582], [357, 646], [280, 672],
  [212, 714], [183, 786], [115, 833], [26, 829],
  // Island end: the deck swings round and drops down the ramp.
  [-51, 790], [-76, 731], [-60, 667],
  // Causeway through the water village, with a chicane, heading north.
  [-110, 608], [-106, 531], [-162, 484], [-204, 425], [-183, 357], [-225, 289], [-208, 212], [-230, 144],
  // Back onto the mainland: the market street and round to the start line.
  [-208, 72], [-166, 21], [-94, 3],
];

/** Height of the road: [metres from the start line, height]. Everything between is smoothed. */
export const THIRD_MAINLAND_HEIGHTS: [number, number][] = [
  [0, 0], [300, 0], [640, 14], [1420, 14], [1760, 0],
];
