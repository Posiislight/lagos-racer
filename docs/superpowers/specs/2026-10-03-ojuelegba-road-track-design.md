# Ojuelegba Road track and gameplay polish

## Goal

Replace the made-up Ojuelegba loop with a track laid out on the real Ojuelegba Road, from the Tejuosho
market to under the Western Avenue bridge. In the same batch, make collisions, vehicles, power-ups and the
HUD feel better. Everything here is single-player; it must not get in the way of the multiplayer milestone
(`docs/superpowers/specs/2026-10-03-multiplayer-design.md`), which uses the same track, vehicles and items.

### Decisions made (with the user, 3 October)

- **Route A, out and back.** Race west along Ojuelegba Road on the north carriageway, U-turn under the
  Western Avenue bridge, race east on the south carriageway, U-turn at the Tejuosho market. The start line is
  outside the market facing west: the view from the user's Street View link (6.508808, 3.369399, heading 277°).
- **Road layout from OpenStreetMap, not Google.** Google's Maps Platform terms (3.2.3(c)) forbid creating
  content from their imagery. OSM data is ODbL: free to use with the credit "© OpenStreetMap contributors".
  Street View was only looked at, by eye, for the look of the street.
- **No Hugging Face image-to-3D.** Its meshes are heavy and don't match the art style. Buildings stay
  procedural, using the painted-facade system already in `src/scene/art/`.
- **Four vehicles, paint is a colour option**: Okada, Keke, Danfo, BRT. Red/Blue Okada and Red/Blue BRT stop
  being separate vehicles.
- **Bumps push vehicles apart** instead of the vehicles grinding together.
- **HUD:** the minimap becomes a straight progress line across the top middle; the power-up button moves to
  the middle of the right-hand side.
- **Keyboard:** Space uses the power-up (E, F and Shift still work). Drift moves from Space to Ctrl.
- **Effects:** speed lines on fuel boost, a juju-hit flash, oily screen edges on crude oil.

### Assumptions

- The new track replaces the old one under the same id, `ojuelegba`, so saved best laps for the old layout
  are cleared (a one-line save migration drops `best.ojuelegba`).
- Paint is free for now; buying paint belongs to the garage milestone.
- Six racers stay on the grid. With four vehicles, rivals repeat, in different paint.
- Real shop, church and company names on the street are replaced with invented ones, as before.

### Out of scope

- Other tracks, the back-street block loop (route B), the elevated Western Avenue motorway as drivable road.
- Buying paint, stickers, horns or upgrades.
- Any multiplayer code. This spec only keeps its interfaces in mind (see Multiplayer compatibility).

## The track

### Where the data comes from

A one-off script, `scripts/osm-track.mjs`, queries the Overpass API for the Ojuelegba Road ways between the
Tejuosho market and the Western Avenue bridge (OSM ways 1157078040, 1489667624, 535027935, 583270859,
218590473/218590475 and 585187762–585187765). It turns them into local metres (origin at the start line,
x east, z south), scales them by 0.55, simplifies them to control points every ~25 m, and prints a
`control` array to paste into `src/config/tracks.ts`. The game never fetches map data while running; the
script is only re-run if we want to re-derive the layout. Its output is checked in.

### Layout

- **Carriageways.** The westbound leg follows the north carriageway, the eastbound leg the south one. Each
  leg is a 13 m wide road (half width 6.5 m, as now). Real carriageways are narrower; ours are wide enough
  to race and overtake.
- **Median.** The two legs run side by side with a 1.6 m median between their inner kerbs: a low concrete
  kerb painted black and white (red and white on one stretch), with lamp posts down the middle. The existing
  kerb walls on both sides of the track already form the median's two faces; the median itself is a new
  scenery strip. Racers see each other across it.
- **U-turns.** Near each end the two legs splay apart, as the real road does at the junctions, so each U-turn
  has a centreline radius of at least 12 m. That is the smallest radius the BRT is required to get round
  (checked by `track-report`).
- **Length.** About 750 m a lap at 0.55 scale (two legs of ~350 m plus the U-turns), 3 laps, as now.
- **Heights.** The real road is flat, but the current track's rolling hills are part of the feel. Hills stay,
  smaller (about 1.5 m top to bottom), and the height is a function of position along the road (distance
  east–west), not distance round the lap. That way both legs are at the same height wherever they are side
  by side, and `heightAt` gives the right answer whichever leg it projects onto.

### Code changes for a two-leg track

- `TrackConfig` gets a `median` field: the lap ranges `[from, to]` where the inner (left) side of the road
  is the median rather than pavement and buildings.
- `buildScenery` skips buildings, crowds and pavement on the inner side inside those ranges, and builds the
  median strip and lamp posts there instead (once, for both legs).
- `hillHeight` takes a position along the road axis instead of lap distance when the track sets
  `hillsAlong: 'axis'` (old behaviour stays the default, so the code still supports looping tracks).
- `scripts/track-report.ts` ignores the median when it looks for sections that come too close: two
  sections may be as close as `2 × halfWidth + median width` if both are in a median range. Anything closer is
  still reported.
- Projection without a hint (`createProgress`, `heightAt`) is checked for snapping to the wrong leg; the
  unit tests cover a point on each leg at the same distance east–west.

### Scenery along the lap

Zones, in the order you drive them. Directions are for the westbound leg; on the eastbound leg the same
buildings are seen from the other side of the median.

| Stretch | North side (right going west) | South side (left going west) |
|---|---|---|
| Start, Tejuosho | Shops with balconies, signboards, hawkers, okadas | Tejuosho market: long grey multi-storey block with rows of balconies, open gutter in front |
| Petrol station | Green-and-white petrol station canopy, then umbrella fruit sellers and a row of parked okadas | Shopping complex with yellow danfos lined up in front (danfo park) |
| Junction | Older 3-storey blocks behind fences | Side-street junction with danfos and yellow taxis |
| Church | Yellow church behind railings (invented name) | Clothing and shoe stalls under awnings |
| Sports shops | Shops painted red, blue and cream, covered in signboards | 3–4 storey blocks, clothes stalls |
| Approach to bridge | Green direction sign over the road (gantry) | Red-and-white kerb stretch |
| West U-turn | Under the Western Avenue bridge: concrete deck overhead, pillars, traffic lights, railings, hawkers | |

Throughout: overhead wires on concrete poles, open gutters along the pavements, cut-out crowds and traders.
New props needed: petrol station canopy, church front (a facade cell), danfo row (exists: `parkedDanfo`),
direction-sign gantry, bridge deck with pillars (the existing `bridge` builder, widened over the U-turn),
median strip with lamp posts.

Goats, chickens and item rows are re-spaced along the new lap. Goats crossing can now cross both legs and
the median.

### Credit

The main menu shows "Road layout © OpenStreetMap contributors", which ODbL requires.

## Gameplay changes

### Bumps push vehicles apart

Today, the arcade grip code in `Vehicle.tsx` removes most sideways speed every physics step. That also
cancels the sideways shove from a collision, so vehicles grind into each other instead of bouncing off.

- Each racer gets a `bump` velocity (x, z). On contact with another vehicle it adds a shove along the contact
  normal: the closing speed times a restitution of about 0.6, with a minimum of about 3 m/s, scaled by
  `otherMass / (otherMass + ownMass)`. An okada hit by a BRT is thrown aside; a BRT hit by an okada barely
  moves.
- The bump velocity is added after the sideways-slide reduction, so it carries, and it fades over about
  0.4 s.
- The vehicle colliders get rounded edges (round cuboids) so vehicles slide off each other instead of
  locking corners.
- The existing `knock` speed loss stays, slightly reduced, since the shove now does part of the job.
- Each car computes its own shove from the other car's mass and velocity. It needs nothing from the other
  car's physics, which is what the multiplayer spec needs (each phone resolves the bump for its own car).

### Four vehicles with paint

- `VEHICLES` in `src/config/vehicles.ts` has four entries: `okada`, `keke`, `danfo`, `brt`. The BRT keeps the
  Blue BRT's stats and the lock at ₦500.
- Each vehicle has `paints: { id: string; name: string; color: string }[]` and a default:
  Okada red, Keke yellow, Danfo yellow, BRT blue. About six paints each.
- The model builders take a body colour. Okada and BRT already do; the Keke and Danfo builders in
  `reference/sporty/vehicles/` get a `body` colour parameter, and `scripts/sync-models.mjs` regenerates
  `src/models/generated/showroom.js`. `buildVehicleModel(id, paint, scale, opts)` replaces the per-colour
  `ModelId`s.
- The garage shows paint swatches under the stats. The chosen paint per vehicle is saved
  (`paint: Record<VehicleId, string>`).
- In a race, rivals pick a random vehicle and paint, never exactly the player's combination.
- Save migration: `okada-blue` becomes `okada` with blue paint; `brt-blue` / `brt-red` become `brt` with the
  matching paint, and unlocking either old BRT unlocks `brt`.

### Making power-ups obvious

- When you pick one up, the item button pops and glows, and a hint appears with the item name and how to use
  it: "JUJU! Press Space" on a keyboard, "JUJU! Tap USE" on a phone. The hint shows for the first three
  pickups (count saved), then only the item name.
- The button pulses for as long as you hold an item.

### Effects

One screen-effects layer, drawn last, off when nothing is happening. Low quality gets fewer lines and no
screen shake.

- **Fuel boost:** speed lines (white streaks rushing in from the screen edges towards the centre), field of
  view widened by about 10°, a small camera shake, and a bigger exhaust flame with sparks.
- **Juju hit:** a purple flash at the screen edges and a short wobble.
- **Crude oil:** dark oily splats at the screen edges while you're slipping.
- **Pickup:** the item icon flies from where you hit it into the item button.

## HUD and controls

- **Progress line** replaces the minimap: a straight horizontal line across the top middle of the screen, from
  start to the end of the lap, with a dot per racer (your dot bigger and white) at their lap progress. The
  current lap number sits at its left end.
- **Power-up button** moves to the middle of the right-hand side of the screen, on phones and laptops. On
  phones it must not overlap the floating right-hand steer zone that is in progress in another session
  (uncommitted changes in `src/ui/TouchControls.tsx` and `src/styles.css`); the item button sits above the
  steer zone and takes touches before it.
- **Keys:** Space uses the power-up; E, F and Shift still work. Ctrl is the drift (handbrake). The menu's key
  hints are updated.

## Multiplayer compatibility

The multiplayer spec imports `src/config/tracks.ts` and `src/config/vehicles.ts` on the server. After this
change a player's choice is `{ vehicle, paint }` instead of a single id, and the track is the new layout.
The multiplayer spec's lap-time sanity check (`track.length / (topSpeed × 1.6)`) still works because it
reads the track length. The new `bump` shove is local to each car, as that spec requires.

## Testing

- **Unit tests** (`npm test`): projection onto each leg (no snapping across the median), lap counting on the
  new track, height matching across the median, save migration of old vehicle ids.
- **`track-report`**: length about 750 m, smallest radius at least 12 m, no sections too close outside the
  median.
- **Play-tests** (`scripts/playtest.mjs`, autopilot, phone size 844×390, low and high quality): every vehicle,
  including the BRT, finishes 3 laps without respawns at the U-turns; at the first corner the grid bunches
  and vehicles bounce apart (no two vehicles overlapping for more than 0.3 s); FPS on low quality no worse
  than the current track.
- **Look:** game screenshots at the same spots as the Street View stops (start, petrol station, church,
  sports shops, under the bridge), side by side, for the user.
- `npm run build` passes (typecheck and PWA build).

## Build order

1. Track data script and new `ojuelegba` control points; two-leg support (median ranges, hills along the
   axis, track-report); unit tests.
2. Scenery for the new track: median, petrol station, church, danfo row, gantry, bridge over the U-turn.
3. Bumps.
4. Four vehicles with paint, garage swatches, save migration.
5. HUD: progress line, power-up button position, Space key, power-up hints.
6. Effects.
7. Play-tests, screenshots, README and `docs/` updates.

## Project doc updates

- README: controls table (Space, Ctrl), the track description, the OSM credit, `scripts/osm-track.mjs`.
- CLAUDE.md: the vehicle table becomes four vehicles with paint options.
