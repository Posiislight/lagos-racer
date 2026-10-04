# Ojuelegba Road Track and Gameplay Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the made-up Ojuelegba loop with an out-and-back track on the real Ojuelegba Road (from OpenStreetMap), and in the same batch make bumps, vehicles, power-ups, the HUD and effects feel better.

**Architecture:** The road's westbound carriageway centreline (the "axis") is generated once from OpenStreetMap into a checked-in file. A pure function turns the axis into a closed loop: north leg west, U-turn under the Western Avenue bridge, south leg east, U-turn at Tejuosho. The rest of the game still sees one closed `Track`. A per-sample median mask tells the track renderer and scenery which left-hand stretches face the median instead of pavement. Gameplay changes are local to `Vehicle.tsx`, the vehicle config and models, the store, the HUD and one new screen-effects overlay.

**Tech Stack:** Vite, React 19, TypeScript, React Three Fiber, three.js r186, @react-three/rapier, zustand, vitest. Node 24 for scripts.

**Spec:** `docs/superpowers/specs/2026-10-03-ojuelegba-road-track-design.md`

## Global Constraints

- Road data comes from OpenStreetMap via the Overpass API, never from Google. Credit text, exactly: `Road layout © OpenStreetMap contributors`.
- No real brand, shop, church or company names. Invented names only (as in `SHOP_SIGNS`). Place names such as Ojuelegba, Surulere, Yaba and Oshodi are fine.
- Doors and kerb side on the right. Nigeria drives on the right, so westbound uses the **north** carriageway.
- Road half width stays `6.5` m. Median width `1.6` m. U-turn centreline radius at least `12` m.
- **Scale `0.38`, not the spec's 0.55.** I measured on the walk that the Street View spot is 825 m (real) from the bridge, not ~600 m. 0.38 hits the spec's lap target of about 750 m (it gives about 790 m).
- Performance: budget Android phones. Low quality must not draw more than the current track (about 100–150 draw calls at 844×390). Effects are off when idle and reduced on low quality.
- Six racers on the grid. Single-player only; don't add multiplayer code.
- **Another session is editing `src/ui/TouchControls.tsx` and `src/styles.css`** (floating steer zones, uncommitted). Before Task 7 run `git status`. If those files still show changes you didn't make, stop and ask the user. Don't overwrite or commit someone else's work.
- Deviations from the spec: (1) the median is a per-sample mask computed from the geometry (`medianMask`), not ranges in the config, so it can never disagree with the layout; (2) goats and chickens cross one leg at a time, starting from the median, rather than crossing both.
- Commit after every task, with the `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` trailer. Stage only the files the task touched.
- Run `npm test` and `npm run typecheck` before every commit; both must pass.

## Review Focus

1. **Projection snapping to the wrong leg.** A car, juju or goat near the median, projected without a hint, must land on its own leg. Pinned by `project stays on its own leg` in Task 1 and `createProgress on the grid` in Task 2.
2. **The BRT at the U-turns.** It is 8.2 m long with weak steering, and must get round both U-turns without respawning. Pinned by the Task 9 play-test assertion (`respawns === 0` for `--vehicle=brt`).
3. **Old saves.** A save with `vehicle: 'okada-blue'`, `unlocked: ['brt-red']` and an old `best.ojuelegba` must load without crashing and map to the new ids. Pinned by `migrateSave` tests in Task 6.
4. **The item button vs the steer zone.** A touch on the mid-right item button must use the item, not steer right. Pinned by the Task 7 manual check with `elementFromPoint`.
5. **Sustained side-by-side contact.** Two cars pressed together for seconds (e.g. against the median) must keep being pushed apart, not stick. Pinned by re-applying the shove while touching (Task 5) and the play-test `maxContact` metric (Task 9).

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/osm-track.mjs` (new) | One-off: fetch Ojuelegba Road from Overpass, write `src/config/ojuelegbaAxis.ts`. |
| `src/config/ojuelegbaAxis.ts` (new, generated) | `OJUELEGBA_AXIS`, `OJUELEGBA_START`. |
| `src/game/outAndBack.ts` (new) | Axis → loop control points; median mask; road distance → lap distance. Pure. |
| `src/game/outAndBack.test.ts` (new) | Tests for the above. |
| `src/game/track.ts` | `buildTrack` gains a `hillsAxis` option. |
| `src/config/tracks.ts` | New `ojuelegba` config: axis, median, road-based zones and bridge. |
| `scripts/track-report.ts` | Median-aware closest-sections check. |
| `src/scene/trackGeometry.ts` | `ribbon`/`sweep` accept a sample mask; stripe kerb texture. |
| `src/scene/Track.tsx` | Masked pavements, median strip and kerbs. |
| `src/scene/scenery.ts` | Zone resolution, median-aware lamps, poles and crowds; wide bridge. |
| `src/scene/landmarks.ts` (new) | New props: Tejuosho market block, petrol station, church, sports shops, direction sign, danfo row. Keeps `scenery.ts` from growing further. |
| `src/game/bump.ts` (new) + `bump.test.ts` | Pure shove maths. |
| `src/scene/Vehicle.tsx` | Bump velocity, round colliders, contact tracking, bigger boost flame. |
| `src/config/vehicles.ts` | Four vehicles, paints. |
| `src/models/index.ts`, `reference/sporty/vehicles/{keke,danfo}.js`, `src/models/generated/*` | Paint colour parameter. |
| `src/game/save.ts` (new) + `save.test.ts` | Save v2 and migration from v1. |
| `src/game/lineup.ts` (new) + `lineup.test.ts` | Rival vehicle and paint picks. |
| `src/game/store.ts`, `src/game/runtime.ts`, `src/scene/RaceScene.tsx` | Paint through the store, racers and grid. |
| `src/ui/Garage.tsx`, `Preview.tsx`, `Results.tsx`, `Menu.tsx` | Paint swatches, paint colours, OSM credit, key hints. |
| `src/game/hints.ts` (new) + `hints.test.ts` | Power-up hint copy. |
| `src/game/input.ts` | Space = item, Ctrl = drift. |
| `src/ui/Hud.tsx`, `src/ui/TouchControls.tsx`, `src/styles.css` | Progress line, mid-right item button. |
| `src/game/fx.ts` (new) | Shared screen-effect state written by the 3D scene, read by the overlay. |
| `src/ui/ScreenFx.tsx` (new), `src/scene/FxBridge.tsx` (new), `src/scene/ChaseCamera.tsx` | Speed lines, juju flash, oil splats, pickup fly; FOV kick and shake. |
| `scripts/playtest.mjs` | v2 save seed, respawn and contact metrics. |

---

### Task 1: Out-and-back geometry

**Files:**
- Create: `src/game/outAndBack.ts`, `src/game/outAndBack.test.ts`
- Modify: `src/game/track.ts` (`hillHeight`, `buildTrack`)

**Interfaces:**
- Produces:
  - `outAndBack(axis: [number, number][], o: { gap: number; turnRadius: number; startAt: number; splay?: number }): [number, number][]`. Control points for `buildTrack`, starting at the start line on the north (westbound) leg.
  - `axisPoint(axis: [number, number][], d: number): { x: number; z: number; tx: number; tz: number; nx: number; nz: number }`. The position, unit direction of travel (east→west) and unit normal to the right of travel, at distance `d` along the axis from its first (east) point.
  - `medianMask(track: Track, halfWidth: number, medianWidth: number): boolean[]`. One entry per `track.points` sample; true where the left side faces the other leg across the median.
  - `roadToS(track: Track, axis: [number, number][], d: number, street: 'north' | 'south', gap: number): number`. Lap distance `s` of the leg next to that street at axis distance `d`.
  - `buildTrack(control, spacing = 2, hills?, hillsAxis: 'lap' | 'x' = 'lap')`. With `'x'`, the height is a function of world x: `Σ a·sin(2π·k·(x − minX)/spanX + ph)`, minus its value at `points[0]`.

- [ ] **Step 1: Write the failing tests** in `src/game/outAndBack.test.ts`, using a straight axis `const axis: [number, number][] = [[0, 0], [-50, 0], [-100, 0], [-150, 0], [-200, 0]]` (travel is −x, so the right of travel is north, −z), `gap = 14.6`, `turnRadius = 12`, `startAt = 40`:
  - `starts on the north leg at startAt`: `control[0]` is close to `[-40, -7.3]` (±0.05).
  - `builds a closed loop of the right length`: `buildTrack(control, 2)` has length between 460 and 500, and every point satisfies `1/|curvature| >= 11` (U-turns are at least 11 m radius after spline smoothing).
  - `keeps the legs a median apart`: the samples nearest x = −100 on each leg are 14.6 ± 0.3 m apart in z.
  - `project stays on its own leg`: from a north-leg sample at x = −100 moved 2 m right, `project(track, x, z)` with no hint returns `lateral` 2 ± 0.1 and `sampleAt(track, p.s).pos.z < 0`.
  - `marks the median, not the U-turns`: `medianMask(track, 6.5, 1.6)` is true at the samples nearest x = −100 on both legs and false at the sample with the smallest x (west U-turn apex).
  - `maps road distance to each leg`: `sampleAt(track, roadToS(track, axis, 100, 'north', 14.6)).pos` is within 0.5 m of `(-100, -7.3)`, and with `'south'` within 0.5 m of `(-100, 7.3)`.
  - `matches heights across the median`: `buildTrack(control, 2, [[0.5, 2, 0.4], [0.1, 9, 1]], 'x')`. The two leg samples nearest x = −100 differ in height by < 0.05 m, and `points[0].pos.y` is 0.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/game/outAndBack.test.ts`
Expected: FAIL, `Failed to resolve import "./outAndBack"`.

- [ ] **Step 3: Implement `src/game/outAndBack.ts` and the `hillsAxis` option.** The algorithm is not determined by the tests, so here it is:
  - Leg offset at axis distance `d`: `off(d) = lerp(gap/2, turnRadius, smoothstep(splay, 0, min(d, L − d)))` with `splay = 30` m, where `L` is the axis length. Each leg widens to the U-turn radius over the last 30 m at each end.
  - North leg: `axisPoint(d) + n·off(d)` for each axis vertex, east to west. South leg: `axisPoint(d) − n·off(d)`, west to east.
  - West U-turn: centre `C` = the last axis point, `t` = travel direction there, points `C + R(n·cosθ + t·sinθ)` for θ = 30°, 60° … 150°. East U-turn: centre = the first axis point, `t` = −(travel direction), points `C + R(−n·cosθ + t·sinθ)`.
  - Loop order: north leg → west arc → south leg → east arc. Insert the exact north-leg point at `startAt`, then rotate the list so it starts there.
  - `medianMask`: for sample `i`, take the point `2·halfWidth + medianWidth` to its left (`−right`). The sample is true when `project(track, that point)` (no hint) has `|lateral| < 1.5` and its `s` is more than 60 m away from sample `i`'s, wrapped round the lap.
  - `roadToS`: `project` the point `axisPoint(d) ± n·gap/2` (+ for north) with no hint and return `.s`.
  - In `track.ts`, add the `'x'` branch next to the existing `hillHeight` without changing the `'lap'` behaviour.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS (the new tests and the existing `race.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/game/outAndBack.ts src/game/outAndBack.test.ts src/game/track.ts
git commit -m "Add out-and-back track geometry, median mask and hills along x"
```

### Task 2: Real road data and the new track config

**Files:**
- Create: `scripts/osm-track.mjs`, `src/config/ojuelegbaAxis.ts` (generated)
- Modify: `src/config/tracks.ts`, `scripts/track-report.ts`, `src/game/race.test.ts`, `src/scene/RaceScene.tsx` (pass `hillsAxis` to `buildTrack`)

**Interfaces:**
- Consumes: `outAndBack`, `buildTrack(…, 'x')`, `medianMask` (Task 1).
- Produces:
  - `src/config/ojuelegbaAxis.ts` exports `OJUELEGBA_AXIS: [number, number][]` (game metres, x east, z south, east to west, a vertex every 20 m) and `OJUELEGBA_START: number` (metres along the axis).
  - `TrackConfig` gains `axis?: [number, number][]` and `median?: { width: number; redWhite?: [number, number] }` (`redWhite` is an axis-distance range).
  - `SceneryZone` becomes `{ kind: ZoneKind; from: number; to: number; side: -1 | 0 | 1 } | { kind: ZoneKind; road: [number, number]; street: 'north' | 'south' }`, where `ZoneKind` is `'market' | 'buildings' | 'danfoPark' | 'palms' | 'billboards' | 'tejuosho' | 'petrol' | 'danfoRow' | 'church' | 'sportsShops'`.
  - Bridges become `{ s?: number; road?: number; name: string; width?: number }`, plus `signs?: { road: number; text: string }[]` for direction signs over the westbound leg.

- [ ] **Step 1: Write `scripts/osm-track.mjs`.**
  - Query: `[out:json];way(id:1157078040,1489667624,535027935,583270859,218590473,585187764,585187765);out geom;` POSTed to `https://overpass-api.de/api/interpreter`. Send `User-Agent: lagos-racer/0.1` and `Accept: application/json`, and retry once on a non-JSON reply.
  - Chain the ways in that order, reversing 1157078040 and 1489667624, which are drawn eastwards.
  - Convert to local metres with the origin at the Street View spot `(6.508808, 3.369399)`: x east, z south.
  - The axis starts 112 m (real) east of the origin, extended along the first segment if the data stops short. It ends 825 m (real) west of the origin, measured along the polyline. That's the Western Avenue bridge.
  - Scale by 0.38, resample every 20 m, and write the file with this header comment: `// Generated by scripts/osm-track.mjs from OpenStreetMap data (© OpenStreetMap contributors, ODbL). Do not edit by hand.` Set `OJUELEGBA_START = 112 * 0.38`.

- [ ] **Step 2: Run it**

Run: `node scripts/osm-track.mjs`
Expected: it prints `axis: N points, length ≈ 356 m` (340–375) and writes `src/config/ojuelegbaAxis.ts`.

- [ ] **Step 3: Write the failing test** in `src/game/race.test.ts`, `describe('ojuelegba track')`:
  - `buildTrack(cfg.control, 2, cfg.hills, 'x')` has length between 700 and 850, and every sample has radius ≥ 11.
  - `createProgress on the grid`: for each of the six grid spawns that `makeRace` computes (lanes `±halfWidth·0.42`, `s = -8 - row·12 - (right ? 5 : 0)`), `createProgress(track, x, z).distance` is within 1 m of that `s`.
  - The start is on the north leg: `track.points[0].tangent.x < -0.5`.
  - Height range (`max − min` of `points[].pos.y`) is between 0.8 and 2.0 m.

- [ ] **Step 4: Run it and see it fail**

Run: `npx vitest run src/game/race.test.ts`
Expected: FAIL. The current config is the old loop, so the length and tangent checks fail.

- [ ] **Step 5: Replace the `ojuelegba` entry in `src/config/tracks.ts`.**
  - `control: outAndBack(OJUELEGBA_AXIS, { gap: 14.6, turnRadius: 12, startAt: OJUELEGBA_START })`, `axis: OJUELEGBA_AXIS`, `halfWidth: 6.5`, `laps: 3`, `median: { width: 1.6, redWhite: [80, 118] }`.
  - `hills: [[0.45, 2, 0.4], [0.25, 5, 1.3], [0.08, 13, 2.1]]`, with `hillsAxis: 'x'` (a new optional field `hillsAxis?: 'lap' | 'x'`, passed through by `RaceScene.makeRace` and `track-report`).
  - `bridges: [{ road: 352, name: 'OJUELEGBA', width: 30 }]`, `signs: [{ road: 327, text: 'SURULERE  ·  OSHODI  ·  YABA' }]`.
  - `items` at lap distances `[90, 260, 450, 620]`. Critters: goats at 180 and 520, chickens at 330 and 690 (counts 3, 2, 5, 4).
  - Zones, as axis distances (from the spec's table, converted at 0.38):
    - North: `buildings [20,80]`, `petrol [82,100]`, `market [100,118]`, `buildings [118,187]`, `church [190,205]`, `buildings [205,240]`, `sportsShops [240,324]`, `market [331,356]`.
    - South: `tejuosho [20,80]`, `danfoRow [80,118]`, `buildings [118,187]`, `market [187,240]`, `buildings [240,324]`, `market [331,356]`.
  - Update the blurb: `"The real Ojuelegba Road: Tejuosho market to under the bridge and back. Mind the agberos."`

- [ ] **Step 6: Make `scripts/track-report.ts` median-aware.** Compute `medianMask` when `cfg.median` is set. When both points of a close pair are masked, skip the pair if its gap is at least `2·halfWidth + median.width − 0.5`. Add `medianSamples: count` to the JSON output.

- [ ] **Step 7: Run the tests and the report**

Run: `npm test`, then `node scripts/track-report.ts ojuelegba track-ojuelegba.svg`
Expected: tests PASS. The report shows a length of 700–850, `minRadius` ≥ 11, `closestSections.gap` ≥ 14, and `medianSamples` > 250.

- [ ] **Step 8: Commit**

```bash
git add scripts/osm-track.mjs src/config/ojuelegbaAxis.ts src/config/tracks.ts scripts/track-report.ts src/game/race.test.ts src/scene/RaceScene.tsx
git commit -m "Lay the Ojuelegba track on the real road from OpenStreetMap"
```

### Task 3: Road surfaces and median

**Files:**
- Modify: `src/scene/trackGeometry.ts` (`ribbon`, `sweep`, new `stripeTexture`), `src/scene/Track.tsx`, `src/scene/scenery.ts` (lamps, poles, start-line crowd)

**Interfaces:**
- Consumes: `medianMask`, `axisPoint` (Task 1); `cfg.median` (Task 2).
- Produces:
  - `ribbon(track, from, to, y, vLength, mask?: boolean[])` and `sweep(track, offset, side, profile, vLength, mask?: boolean[])`. A quad between samples `i` and `i+1` is emitted only when `mask[i]` is true; no mask means all.
  - `stripeTexture(a: string, b: string): Texture`, which generalises `kerbTexture` (`kerbTexture()` becomes `stripeTexture('#f2c200', '#1d1d1d')`).
  - `buildScenery(cfg, track, density, median: boolean[] | null)`.

- [ ] **Step 1: Write the failing test** in `src/game/outAndBack.test.ts`: `ribbon with a mask` builds `ribbon(track, -7, -6.5, 0, 1, mask)` on the straight-axis track from Task 1, with `mask` = every other sample true. Its index count is `6 × (number of true entries)`. (`ribbon` imports only three, so it runs under vitest.)

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/game/outAndBack.test.ts -t "ribbon with a mask"`
Expected: FAIL; the index count equals the unmasked count.

- [ ] **Step 3: Implement the masks**, then use them in `Track.tsx` when `cfg.median` is set. Let `mask = medianMask(track, hw, cfg.median.width)` and `notMask = mask.map(m => !m)`.
  - `paveL` and the left concrete `kerbL` use `notMask`.
  - On masked samples the left kerb sweeps with `stripeTexture('#f5f5f0', '#1d1d1d')`. Inside `cfg.median.redWhite` (convert the axis range to samples via `roadToS` on both streets) it uses `stripeTexture('#f5f5f0', '#c62828')`.
  - A median top ribbon from `-(hw + KERB)` to `-(hw + width/2)` at `y = 0.18` with the concrete kerb texture, on masked samples. Each leg draws its half.
  - Walls are unchanged; the two legs' inner walls form the median's faces.

- [ ] **Step 4: Make the scenery median-aware** in `scenery.ts`, taking the `median` mask:
  - Pavement lamps on the left side are replaced on masked samples by a double-arm lamp at lateral `-(hw + width/2)` every 30 m, with arms over both legs.
  - `poles()` skips the left side on masked samples, and skips wires across the road there.
  - Start-line spectators skip side −1 when `median[0]`.

- [ ] **Step 5: Run the tests and look**

Run: `npm test`, then `npm run dev` and `node scripts/playtest.mjs --autopilot --seconds=12 --shots=2,8 --size=844x390 --mobile`
Expected: tests PASS. Screenshots show a black-and-white median kerb with lamp posts between the legs, no pavement or buildings in the median, and the other leg visible across it. The log shows `errors: []`.

- [ ] **Step 6: Commit**

```bash
git add src/scene/trackGeometry.ts src/scene/Track.tsx src/scene/scenery.ts src/game/outAndBack.test.ts
git commit -m "Draw the median: striped kerbs, lamp posts, no pavement between the legs"
```

### Task 4: Ojuelegba Road landmarks

**Files:**
- Create: `src/scene/landmarks.ts`
- Modify: `src/scene/scenery.ts` (zone resolution, new zone kinds, `bridge` width and pillars, direction signs)

**Interfaces:**
- Consumes: `roadToS` (Task 1); `SceneryZone`, `bridges`, `signs` (Task 2). In `scenery.ts`: `MatFn`, `Spot`, `building`, `street`, `spot`, `place`, `person`, `parkedDanfo`, `signs` atlas.
- Produces: in `landmarks.ts`, prop builders that take `(m: MatFn, r: () => number)` plus sizes and return a `Group` facing local +z (towards the road), like `parkedDanfo`:
  - `tejuoshoBlock(length: number)`: a grey 5-storey block with balcony slabs every storey, railings, and an open gutter strip in front.
  - `petrolStation()`: a white canopy with a green band on 4 posts, 2 pumps, and a forecourt slab.
  - `church(label: Mesh)`: a yellow 2-storey front with a tower, an arched railing fence and the given sign plane (`GRACE BAPTIST CHURCH`, added to `SHOP_SIGNS`).
  - `directionSign(text: string, width: number)`: a green board on two posts over the road.
  - `parkedOkada()`: a parked bike (red or black body box, seat, two wheels), about 1.9 m long.

- [ ] **Step 1: Resolve zones.** For a `road` zone, `s0 = roadToS(track, cfg.axis, road[0], street, gap)` and `s1` likewise. Swap them if `s1 < s0` (the south leg runs the other way), and always use side `+1`. Lap-fraction zones keep their old behaviour.

- [ ] **Step 2: Add the zone kinds to the zone loop.**
  - `tejuosho`: one `tejuoshoBlock(s1 − s0)` at `FRONT`.
  - `petrol`: a petrol station at the zone centre, set back `FRONT + 4`, then a row of `parkedOkada()` every 1.4 m on the pavement after it.
  - `danfoRow`: `street()` with `rows: 2` behind, plus `parkedDanfo` every 5 m along the kerb at `hw + 2.2`, parallel to the road.
  - `church`: a church at the zone centre.
  - `sportsShops`: `street()` using `'shops'` facades, with tints from `['#d0141a', '#1565c0', '#f2d0a4']` instead of `PAINT`. Pass a `tints` option through `street()` and `building()`.

- [ ] **Step 3: Widen the bridge and add direction signs.**
  - `bridge(track, cfg, s, name, m, o: { width?: number; median?: number })`. With a median, centre the deck at lateral `-(hw + median/2)`, with half-span `2·hw + median/2 + 22`. Put pillars at laterals `hw + 1.4`, `hw + 20`, `-(hw + median/2)` (0.9 m square), `-(3·hw + median + 1.4)` and `-(3·hw + median + 20)`. Deck depth along the road = `width` (default 13).
  - `cfg.signs` → `directionSign` placed at `roadToS(…, 'north')`.

- [ ] **Step 4: Look**

Run: `node scripts/playtest.mjs --autopilot --seconds=40 --shots=1,6,12,18,24,30 --size=844x390 --mobile`, and the same at `--quality=low`.
Expected:
- **Screenshots:** they show the market block, the petrol canopy, the danfo row, the church, the colourful shops, the green sign and the bridge over the west U-turn.
- **No collisions:** there are no props in the road.
- **Draw calls:** the low-quality log shows `calls` ≤ 160 throughout.
- **Errors:** `errors: []`.

Put the screenshots next to the Street View stops (start, petrol station, church, sports shops, under the bridge) in `docs/screenshots/ojuelegba-road/` for the user.

- [ ] **Step 5: Commit**

```bash
git add src/scene/landmarks.ts src/scene/scenery.ts docs/screenshots/ojuelegba-road
git commit -m "Ojuelegba Road landmarks: Tejuosho market, petrol station, church, sports shops, bridge"
```

### Task 5: Bumps push vehicles apart

**Files:**
- Create: `src/game/bump.ts`, `src/game/bump.test.ts`
- Modify: `src/scene/Vehicle.tsx`, `src/game/runtime.ts` (`Racer`)

**Interfaces:**
- Produces:
  - `type BumpBody = { x: number; z: number; vx: number; vz: number; mass: number }`
  - `bumpShove(own: BumpBody, other: BumpBody): { x: number; z: number }`. The direction is from `other` to `own` (horizontal, unit; if the centres coincide, use the side of `own`'s velocity). The speed is `max(3, 0.6 · closing) · other.mass / (other.mass + own.mass)`, where `closing = max(0, −(v_own − v_other) · dir)`.
  - `Racer` gains `bump: { x: number; z: number }` and `touching: Set<number>` (racer ids currently in contact). Both are initialised in `makeRacer`.

- [ ] **Step 1: Write the failing tests** in `src/game/bump.test.ts`:
  - `equal masses, at rest, side by side`: own `(0,0)`, other `(0,2)`, both mass 500, no velocity → shove `{x: 0, z: -1.5}` (±0.01).
  - `light bike hit by a bus`: own mass 260, other mass 2400 at `(0, 2)` moving `vz = -10` → `z` < −5.4 (0.6·10·0.902 = 5.41) and `|x|` < 0.01.
  - `bus hit by a bike barely moves`: swap the masses → `|z|` < 0.6.
  - `separating vehicles still get the minimum shove`: other moving away (`vz = +5`) → `|z|` equals `3 · share`.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/game/bump.test.ts`
Expected: FAIL, unresolved import.

- [ ] **Step 3: Implement `bump.ts` and wire it into `Vehicle.tsx`:**
  - `onCollisionEnter` with a racer: `racer.bump += bumpShove(own, other)` (using both bodies' `translation()` and `linvel()` and `tuning.mass`), add the other's id to `racer.touching`, and set `bumpCooldown = 0.25`. `onCollisionExit` removes the id.
  - In `useBeforePhysicsStep`, while `touching.size > 0`, re-apply the shove for each touching racer every 0.25 s.
  - The order inside the grounded branch matters. The bump component lives outside the arcade grip:
    1. Subtract `racer.bump` from `lin` before working out `fwdSpeed` and `side`.
    2. Do the existing side-slide reduction, knock and scrape drag on the remainder.
    3. Add `racer.bump` back into `nx`/`nz`.
    4. Decay it: `bump *= exp(−dt / 0.13)`. Zero it below 0.05 m/s.
  - Collider: `RoundCuboidCollider` with `r = min(half[0], half[2]) · 0.5`, `args={[half[0]-r, half[1]-r, half[2]-r, r]}`; same mass, friction and restitution.
  - Racer-racer knock: `(0.03 + 0.12 · headOn) · share · 2`. Walls are unchanged.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/bump.ts src/game/bump.test.ts src/scene/Vehicle.tsx src/game/runtime.ts
git commit -m "Bumps shove vehicles apart by mass instead of jamming them together"
```

### Task 6: Four vehicles with paint

**Files:**
- Create: `src/game/save.ts`, `src/game/save.test.ts`, `src/game/lineup.ts`, `src/game/lineup.test.ts`
- Modify: `src/config/vehicles.ts`, `src/models/index.ts`, `reference/sporty/vehicles/keke.js`, `reference/sporty/vehicles/danfo.js`, `src/models/generated/showroom.js` + `.d.ts` (regenerated), `src/game/store.ts`, `src/game/runtime.ts`, `src/scene/RaceScene.tsx`, `src/scene/Vehicle.tsx`, `src/scene/RaceLogic.tsx`, `src/ui/Garage.tsx`, `src/ui/Preview.tsx`, `src/ui/Results.tsx`, `src/ui/Menu.tsx`, `src/styles.css`, `scripts/playtest.mjs`

**Interfaces:**
- Produces:
  - `type VehicleId = 'okada' | 'keke' | 'danfo' | 'brt'`; `type Paint = { id: string; name: string; color: string }`; `VehicleConfig.paints: Paint[]` (the first is the default); `paintOf(v: VehicleConfig, id?: string): Paint`.
  - Paints. Ids are the lowercase names (`'red'`, `'blue'` …), colours exactly:
    - **okada:** Red `#d0141a`, Blue `#0b55c4`, Black `#1b1b1b`, Green `#1f9d55`, Orange `#ff7a00`, Purple `#7b2cbf`
    - **keke:** Yellow `#ffb000`, Green `#1f9d55`, Blue `#0b55c4`, Red `#d0141a`, White `#f2f2f2`, Pink `#e84393`
    - **danfo:** Yellow `#f7b500`, Red `#d0141a`, Blue `#0b55c4`, Green `#1f9d55`, White `#f2f2f2`, Black `#1b1b1b`
    - **brt:** Blue `#0f86cf`, Red `#d4141c`, Green `#1f9d55`, Yellow `#f5b400`, Purple `#7b2cbf`, Black `#1b1b1b`
  - `buildVehicleModel(id: VehicleId, color: string, scale = 1, opts)`. Builders: `buildOkada(color)`, `buildKeke(color)`, `buildDanfo(color)`, `buildBRT(color, '01')`.
  - `Racer.paint: Paint` (a new `makeRacer` parameter after `vehicle`).
  - `type Saved` (now in `save.ts`) gains `paint: Partial<Record<VehicleId, string>>` and `itemHints: number`. `SAVE_KEY = 'lagos-racer:v2'`. `migrateSave(v1: unknown): Saved` and `loadSave(): Saved`.
  - `pickRivals(player: { vehicle: VehicleId; paint: string }, count: number, rand = Math.random): { vehicle: VehicleId; paint: string }[]`
  - `Result` gains `color: string`.

- [ ] **Step 1: Write the failing tests.**
  - `save.test.ts`:
    - `migrates the blue okada`: `{ vehicle: 'okada-blue', unlocked: [] }` → `vehicle: 'okada'`, `paint.okada: 'blue'`.
    - `migrates the red BRT`: `{ vehicle: 'brt-red', unlocked: ['brt-red'] }` → `vehicle: 'brt'`, `unlocked: ['brt']`, `paint.brt: 'red'`.
    - `drops the old Ojuelegba best lap`: `best: { ojuelegba: 61.2 }` → `best: {}`.
    - `survives junk`: `migrateSave(null)` and `migrateSave('x')` return the defaults.
  - `lineup.test.ts`:
    - `pickRivals({vehicle:'okada', paint:'red'}, 5, seeded)` returns 5 picks.
    - Every one of the four vehicle ids appears at least once.
    - No pick equals the player's pair, and no two picks share a vehicle and paint.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/game/save.test.ts src/game/lineup.test.ts`
Expected: FAIL, unresolved imports.

- [ ] **Step 3: Implement.**
  - **Vehicle config:** merge the duplicate configs into four. The BRT uses the old Blue BRT values with `locked: { coins: 500 }`, and its `color` field (used for menus) is replaced by `paintOf(v).color`.
  - **Builders:** in `keke.js` change `const Y=paint('#ffb000')` to take a `body='#ffb000'` parameter of `buildKeke`; in `danfo.js` do the same with `'#f7b500'`. Then run `node scripts/sync-models.mjs` and update `showroom.d.ts` (`buildKeke(body?: string)`, `buildDanfo(body?: string)`).
  - **Grid:** `RaceScene.rivals` uses `pickRivals`.
  - **Engine note:** `RaceLogic`'s engine pitch test becomes `vehicle.id === 'okada'`.
  - **Garage:** paint swatches under the stats (buttons with `aria-label="<Name> paint"` and `aria-pressed`). Choosing one saves `paint[vehicle]`.
  - **Display:** `Preview` and `Results` show the paint colour.
  - **Playtest:** `playtest.mjs` seeds `lagos-racer:v2` with `unlocked: ['brt']` and accepts `--vehicle=brt`.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Check the garage by hand**

Run the dev server and open `/?unlock=all` at 844×390 in the browser pane. Check:
- The garage lists four vehicles, each with six swatches.
- Picking Danfo/Red and racing shows a red danfo.
- Five rivals appear, covering all four vehicles.

- [ ] **Step 6: Commit**

```bash
git add src/config/vehicles.ts src/models reference/sporty/vehicles/keke.js reference/sporty/vehicles/danfo.js src/game src/scene/RaceScene.tsx src/scene/Vehicle.tsx src/scene/RaceLogic.tsx src/ui/Garage.tsx src/ui/Preview.tsx src/ui/Results.tsx src/ui/Menu.tsx src/styles.css scripts/playtest.mjs
git commit -m "Four vehicles with paint colours; save v2 with migration"
```

### Task 7: HUD, keys and power-up hints

First, `git status`; see Global Constraints about `TouchControls.tsx` and `styles.css`.

**Files:**
- Create: `src/game/hints.ts`, `src/game/hints.test.ts`
- Modify: `src/game/input.ts`, `src/ui/Hud.tsx`, `src/ui/TouchControls.tsx`, `src/styles.css`, `src/scene/RaceLogic.tsx`, `src/game/store.ts`, `src/ui/Menu.tsx`

**Interfaces:**
- Consumes: `Saved.itemHints` (Task 6).
- Produces: `itemHint(kind: ItemKind, input: 'keys' | 'touch', shown: number): string`.

- [ ] **Step 1: Write the failing test** in `hints.test.ts`. The exact copy:
  - `itemHint('juju','keys',0)` → `'JUJU! Press Space to throw it at the racer ahead'`
  - `itemHint('fuel','touch',2)` → `'FUEL! Tap USE for a speed boost'`
  - `itemHint('oil','keys',1)` → `'CRUDE OIL! Press Space to drop it behind you'`
  - `itemHint('juju','touch',3)` → `'JUJU!'`

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/game/hints.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.**
  - **`input.ts`:** `Space` joins the item keys (with E, F and Shift, still on keydown without repeat). The handbrake reads `ControlLeft`/`ControlRight` instead of `Space`.
  - **`RaceLogic`:** when the player's `item` goes from `null` to a kind, `store.flash(itemHint(kind, isTouch ? 'touch' : 'keys', itemHints))` and increment `itemHints` (saved). `isTouch` is `matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0`, the same test as `useIsTouch`.
  - **`Hud`:**
    - Replace `Minimap` with `ProgressLine`: a horizontal bar at the top centre (`width: min(46vw, 420px)`), with a dot per racer at `left: frac·100%`, where `frac = ((distance % L) + L) % L / L`. The player's dot is larger and white; others use `racer.paint.color`. It updates in a `requestAnimationFrame` loop like the minimap did.
    - Move `LAP n/3` to the bar's left end.
  - **Item button:**
    - `.hud-item` moves to the middle of the right-hand side: `top: 50%; right: calc(14px + var(--safe-r)); transform: translateY(-50%)`. Fix the `pulse` keyframes to match. On touch devices it is 88 px.
    - Remove the separate `USE` pad from `TouchControls` (the horn stays).
    - Give `.hud-item` a `z-index` above `.touch` (12), so it takes touches before the right steer zone.
  - **Menu key hints:** `You're always on the gas · ← → or A D to steer · Space to use items · Ctrl to drift · H to honk · Esc to pause`.

- [ ] **Step 4: Run tests, then check by hand**

Run: `npm test`. Then, in the browser pane at 844×390 with touch emulation, during a race:
- `document.elementFromPoint(innerWidth - 60, innerHeight / 2)` is inside `.hud-item` (Review Focus 4).
- The progress line shows 6 dots that move.
- Pressing Space with an item uses it; Ctrl drifts.
- The first pickup shows the full hint.

- [ ] **Step 5: Commit**

```bash
git add src/game/hints.ts src/game/hints.test.ts src/game/input.ts src/ui/Hud.tsx src/ui/TouchControls.tsx src/styles.css src/scene/RaceLogic.tsx src/game/store.ts src/ui/Menu.tsx
git commit -m "Progress line, mid-right power-up button, Space to use items, pickup hints"
```

### Task 8: Power-up effects

**Files:**
- Create: `src/game/fx.ts`, `src/scene/FxBridge.tsx`, `src/ui/ScreenFx.tsx`
- Modify: `src/scene/RaceScene.tsx` (mount `FxBridge`), `src/ui/Race.tsx` (mount `ScreenFx` between the canvas and the HUD), `src/scene/ChaseCamera.tsx`, `src/scene/Vehicle.tsx` (`effectMeshes`)

**Interfaces:**
- Produces: `fx` (a plain mutable object in `fx.ts`, read and written without React):
  - `boost: number`: 0..1, eased towards 1 while `player.boost > 0`, at a rate of 1/0.25 s up and 1/0.4 s down.
  - `juju: number`: seconds since the player was cursed; `Infinity` when not.
  - `slip: number`: 0..1.
  - `pickups: { kind: ItemKind; x: number; y: number; t: number }[]`: screen positions in CSS pixels.
  - `quality: Quality`.
- `FxBridge` (inside the canvas) updates `fx` every frame from the player racer. On pickup it pushes the screen position of the pickup, using `Vector3.project(camera)`.

- [ ] **Step 1: `ScreenFx.tsx`.** A full-screen `pointer-events: none` layer:
  - **Speed lines:** a `<canvas>` at half device resolution, drawn only while `fx.boost > 0.01` (otherwise `display: none`). It holds N lines (low 16, medium 28, high 40). Each has a random angle θ and a radius `ρ` in units of the half-diagonal. `ρ` moves inwards from 1.15 to 0.55 at 2.2 units/s, then respawns at 1.15 with a new θ. Each line is a stroke from `ρ` to `ρ + len` (len 0.12–0.25), white, with `lineWidth` 1–3 px and `globalAlpha = fx.boost · smoothstep(0.55, 0.75, ρ)`.
  - **Juju flash:** a `div` with a radial purple vignette `radial-gradient(transparent 55%, rgba(156,39,255,.55))` and opacity `max(0, 1 − fx.juju / 0.6)`.
  - **Oil:** four absolutely positioned SVG blobs (inline, dark `#120e0a`, 70% opacity) at the screen edges, with opacity `fx.slip`.
  - **Pickup fly:** for each entry in `fx.pickups`, an `<img src={ITEM_ICON[kind]}>` animated over 0.45 s with the Web Animations API from `(x, y)` to the centre of `.hud-item`, then removed.

- [ ] **Step 2: Camera and flame.**
  - **Camera:** in `ChaseCamera`, the target FOV is `lerp(62, 74, speedFrac) + 10 · fx.boost`. Unless `fx.quality === 'low'`, add a shake offset of `0.06 · fx.boost` (sin at 31 Hz on x, 27 Hz on y) to the camera position.
  - **Flame:** in `Vehicle.tsx`, the flame is 1.4× longer while boosting. Add `sparks`, a `Points` of 12 points with an additive `PointsMaterial` (size 0.12, `#ffd27a`), placed randomly in a 0.6 m box behind the flame each frame and visible only while boosting.

- [ ] **Step 3: Look and measure**

Run: `node scripts/playtest.mjs --autopilot --seconds=30 --shots=4,9,14,19,24 --size=844x390 --mobile --quality=low`, and the same at `--quality=high`.
Expected:
- **Screenshots:** they show speed lines during an AI boost (the log `fx` column shows `B` for the player at that time), and the purple edge after a juju hit.
- **FPS:** average FPS on low is within 10% of Task 4's low run.
- **Errors:** `errors: []`.

- [ ] **Step 4: Commit**

```bash
git add src/game/fx.ts src/scene/FxBridge.tsx src/ui/ScreenFx.tsx src/scene/RaceScene.tsx src/ui/Race.tsx src/scene/ChaseCamera.tsx src/scene/Vehicle.tsx
git commit -m "Speed lines, juju flash, oily screen edges and pickup fly-in"
```

### Task 9: Play-test, docs

**Files:**
- Modify: `scripts/playtest.mjs`, `README.md`, `CLAUDE.md`, `src/ui/Menu.tsx` (credit), `docs/overnight-plan.md` (short pointer to the spec)

- [ ] **Step 1: Add play-test metrics.**
  - `respawns`: count `racer.respawn` going true. Add a `respawns` counter to `Racer`, incremented in `Vehicle.tsx`'s respawn branch.
  - `maxContact`: the longest continuous time any pair stays in each other's `touching` sets while both are moving faster than 3 m/s.
  - Print both per vehicle at the end.

- [ ] **Step 2: Add the OSM credit** in `Menu.tsx` under the track line: `<p className="credit muted">Road layout © OpenStreetMap contributors</p>`.

- [ ] **Step 3: Run the full play-test for every vehicle**

Run, for each `--vehicle=okada|keke|danfo|brt`: `node scripts/playtest.mjs --autopilot --seconds=200 --size=844x390 --mobile --quality=low --unlock`
Expected, for each run:
- **Laps:** `results` lists 6 racers and the player finished 3 laps.
- **Respawns:** 0 for the player, including the BRT run (Review Focus 2).
- **Contact:** `maxContact` < 1.5 s (Review Focus 5).
- **Errors:** `errors: []`.

Then `npm run build` passes.

- [ ] **Step 4: Update the docs.**
  - **README:** the controls table (Space uses items, Ctrl drifts), the track description, the OSM credit, and `node scripts/osm-track.mjs` in the commands table.
  - **CLAUDE.md:** the vehicle table becomes four vehicles plus a line on paint options. The Tracks line gains `Ojuelegba is laid out on the real road from OpenStreetMap (scripts/osm-track.mjs)`.

- [ ] **Step 5: Commit**

```bash
git add scripts/playtest.mjs src/scene/Vehicle.tsx src/game/runtime.ts src/ui/Menu.tsx README.md CLAUDE.md docs/overnight-plan.md
git commit -m "Play-test metrics for respawns and contact; docs for the new track and controls"
```
