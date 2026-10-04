# Ikorodu Garage Track Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second track, `ikorodu`: General Hospital Ikorodu to the garage roundabout and back, 3 laps at 0.3 scale, with real signage lettering read off signs, plus a track picker.

**Architecture:** The Ojuelegba two-leg code already exists (`outAndBack`, `median`, `hillsAxis: 'road'`, `roadSpan`), so `ikorodu` is another `TrackConfig` built from a new axis file. New config fields (`signage`, `islands`, `invented`, `median.barrier`) are optional so Ojuelegba is unchanged. Brand signs are data in `src/config/signs/ikorodu.ts` and are drawn only when `signage === 'real'`.

**Tech Stack:** Vite, React, TypeScript, React Three Fiber, vitest (`npm test`), `node scripts/track-report.ts`.

**Spec:** `docs/superpowers/specs/2026-10-04-ikorodu-garage-track-design.md` (route plot: `2026-10-04-ikorodu-route.svg`). Pattern to copy: `docs/superpowers/specs/2026-10-03-ojuelegba-road-track-design.md`.

## Global Constraints

- Scale 0.3, 3 laps, road half width 6.5 m, median 1.6 m, lap about 900 m (accept 800 to 1000), smallest radius at least 12 m at both U-turns.
- Layout from OpenStreetMap only; credit "© OpenStreetMap contributors" stays in the menu. Never derive layout or models from Street View or Google Maps.
- A real name goes on a sign only if it is `status: 'verified'` in the signs table (read off a sign). Nothing invented. Names seen only in OSM are not used: Access Bank, Skye Bank, Accion, Primero, Forte Oil, Shine Shine Plaza, Trade Center.
- Real brands are lettering in brand colours. No logo image files are downloaded or shipped.
- `signage: 'generic'` must produce no text from the signs file.
- Real-name exception to "No real brand logos" is recorded in `CLAUDE.md` (Task 8).
- Performance: low-poly, reuse materials, scenery merges through `chunkAndMerge`; test at phone size 844x390.
- Single-player only; `ikorodu` is just another entry in `TRACKS`, so the multiplayer server keeps working.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Six grid slots must each land on their own leg, on a straight, clear of the hospital-end taper (grid on the hospital end splay would put slots on the wrong leg). Task 1 test.
2. Both U-turns must be at least 12 m radius (BRT), including the hospital end where OSM gives only 10 m of road. Task 1 test and Task 3 `invented` flag.
3. Both legs at the same height across the median on the long single-road stretch. Task 1 test.
4. `signage: 'generic'` shows no text, and an unverified sign (e.g. "IKOR…", "KD Lounge") can never render. Task 4 tests.
5. A saved `track` id that no longer exists (or a first run) must fall back to `ojuelegba` rather than crash on `trackById(...)` returning undefined. Task 7 test.

---

### Task 1: Axis, track entry and geometry tests

**Files:**
- Create: `scripts/ikorodu-axis.mjs`, `src/config/ikoroduAxis.ts` (generated), `src/config/tracks.test.ts`
- Modify: `src/config/tracks.ts` (new entry, `ZoneKind` unchanged for now)

**Interfaces:**
- Produces: `IKORODU_AXIS: [number, number][]` (hospital end first, roundabout last, game metres, x east, z south, translated so the start-line point is the world origin), `IKORODU_START: number` (metres along the axis).
- Produces: `TRACKS` entry with `id: 'ikorodu'`, `name: 'Ikorodu Garage'`.

- [ ] **Step 1: Write failing tests in `src/config/tracks.test.ts`** (read `ojuelegba track` block of `src/game/race.test.ts:105-180` and copy its helpers):
  - `ikorodu lap is 800 to 1000 m` using `trackFor(trackById('ikorodu')).length`.
  - `ikorodu smallest radius is at least 11.5` (same bound style as `outAndBack.test.ts`; sample `curvature`).
  - `ikorodu grid slots are on their own leg`: copy the Ojuelegba "every grid slot on its own leg" test with the ikorodu track.
  - `ikorodu start is clear of the hospital-end taper`: axis distance of the start leg point is greater than the `splay` used in the entry.
  - `ikorodu legs are the same height across the median`: copy the Ojuelegba test.
  - `every track builds`: for each of `TRACKS`, `trackFor(t).length > 0` and `t.laps >= 1`.
- [ ] **Step 2: Run** `npx vitest run src/config/tracks.test.ts`. Expected: FAIL (`trackById('ikorodu')` undefined).
- [ ] **Step 3: Write `scripts/ikorodu-axis.mjs`** that takes these real-metre points (origin at the junction pin, z south; the spec's route with the Out and Back carriageways averaged, ending at the roundabout centre): `(-474,1307) (-503,1289) (-385,1094) (-265,881) (-207,754) (-126,519) (-95,402) (-50,262) (-37,219) (-8,70) (-5,22)`. It scales by 0.3, resamples every 20 game metres (keep the last point exactly), translates so the point at `IKORODU_START` is (0,0), and writes `src/config/ikoroduAxis.ts` in the style of `ojuelegbaAxis.ts` (generated header, OSM credit, way ids 459427794, 538323260, 1460813931, 778859468, 1460813930, 134580953). No network call: the points are the checked-in result of the routing in the spec. `IKORODU_START` is 45.
- [ ] **Step 4: Run** `node scripts/ikorodu-axis.mjs`, then add the entry to `TRACKS`: `control: outAndBack(IKORODU_AXIS, { gap: 2 * HALF_WIDTH + MEDIAN, turnRadius: 13, splay: 40, startAt: IKORODU_START })`, `axis`, `median: { width: MEDIAN }`, `hills` like Ojuelegba but amplitudes about 70% of it, `hillsAxis: 'road'`, `halfWidth: HALF_WIDTH`, `laps: 3`, `bridges: []`, `ground: '#a87d5c'`, `items` four pickups on each lap about 230 m apart starting at 60, `critters` four (goat, chicken, goat, chicken) between them, `zones` of `buildings` on both streets over the whole axis (placeholders; Tasks 5 and 6 replace them). `blurb`: "From the General Hospital to the garage roundabout and back. Mind the okadas." Axis runs hospital to roundabout, so street `'north'` means the right-hand (outbound) side going to the roundabout.
- [ ] **Step 5: Run** the new tests. Expected: PASS. If grid or radius tests fail, tune `splay`/`startAt`/`turnRadius`, not the tests.
- [ ] **Step 6: Run** `node scripts/track-report.ts ikorodu` and check: length about 900, `closestSections.gap` at least 14.4 (outside the median), no warning. Then `npm test` and `npm run build`.
- [ ] **Step 7: Commit** `git add scripts/ikorodu-axis.mjs src/config/ikoroduAxis.ts src/config/tracks.ts src/config/tracks.test.ts && git commit -m "Add Ikorodu Garage track layout"`

### Task 2: Concrete barrier and painted kerb median

**Files:**
- Modify: `src/config/tracks.ts` (`median` type and Ikorodu entry), `src/scene/Track.tsx` (median parts), `src/scene/scenery.ts` (barrier wall next to the median lamps, `scenery.ts:406-415`)
- Test: `src/config/tracks.test.ts`

**Interfaces:**
- Consumes: `roadRangeMask(track, axis, range, gap)` from `src/game/outAndBack.ts`.
- Produces: `TrackConfig.median.barrier?: [number, number]` (axis range, metres, where the median is a concrete barrier wall; elsewhere the black-and-white painted kerb). For Ikorodu: the dual carriageway is the last 390 real m, which is 117 game metres, so `[L - 117, L]` where `L` is the axis length (compute it from `IKORODU_AXIS`, do not hardcode).

- [ ] **Step 1: Failing test** `ikorodu barrier range lies inside the axis and covers about 117 m`: range ends at axis length, length between 100 and 130 m, and `roadRangeMask` is true for at least one sample on each leg.
- [ ] **Step 2: Run** it; expected FAIL (`barrier` undefined).
- [ ] **Step 3: Implement** the config field and entry value; in `Track.tsx` exclude the barrier mask from the black-and-white kerb ribbon; in `scenery.ts` add `barrierWall(...)`: a low concrete wall (0.9 m high, median width wide) along the barrier range, built once with the median lamps, grey concrete material shared with the kerb, merged by `chunkAndMerge`.
- [ ] **Step 4: Run** tests; expected PASS. Then `preview_start` the dev server, pick the track by setting `track: 'ikorodu'` in the store (temporary, via `useGame.setState` in the console), screenshot at the start and 60 m before the roundabout. The wall and the kerb strip must be visible and nothing z-fights.
- [ ] **Step 5: Commit** `git commit -m "Ikorodu: concrete barrier median on the dual carriageway"` (add the changed files by name).

### Task 3: Roundabout island, hospital U-turn, invented-geometry flag

**Files:**
- Modify: `src/config/tracks.ts`, `src/scene/scenery.ts`, `src/scene/landmarks.ts`, `scripts/track-report.ts`
- Test: `src/config/tracks.test.ts`

**Interfaces:**
- Produces: `TrackConfig.islands?: { road: number; radius: number; statue?: boolean }[]` (centred on the axis point `road` metres along; scenery fills the disc), `TrackConfig.invented?: { road: [number, number]; why: string }[]`.
- Produces: `statueIsland(m: MatFn, radius: number): Group` in `landmarks.ts`.
- Ikorodu values: island at `road: L`, `radius: 6.2`, `statue: true`; `invented: [{ road: [0, 12], why: 'OSM shows only a 34 m service road at the hospital; the U-turn there is a constructed 13 m turning circle' }]`.

Note: the spec says the island is "enlarged to 12 m", but 12 m is the centreline radius; the island that fits inside a 13 m centreline with a 6.5 m half width is about 6.2 m, close to the true scaled ring (18 m x 0.3 = 5.4 m). Plan uses 6.2 m.

- [ ] **Step 1: Failing tests**: `ikorodu island fits inside the U-turn` (island radius + halfWidth <= the 13 m turn radius) and `track-report invented list exists` (`invented` has one entry, its range inside the axis).
- [ ] **Step 2: Run**; expected FAIL.
- [ ] **Step 3: Implement** config fields, `statueIsland` (kerbed disc, plinth, simple statue figure in stone grey, a blue direction arrow plate), call it from `buildScenery` for each island; pavement/building placement must skip the island disc. Add to `track-report.ts` a printed `invented` array from the config.
- [ ] **Step 4: Run** tests and `node scripts/track-report.ts ikorodu`; the output lists the invented range. Preview screenshot of the roundabout from the approach and from a BRT-sized turn (autopilot run, no wall hits).
- [ ] **Step 5: Commit** `git commit -m "Ikorodu: roundabout island with statue; flag the constructed hospital U-turn"`

### Task 4: Signs data and the `signage` flag

**Files:**
- Create: `src/config/signs/ikorodu.ts`, `src/config/signs/signs.test.ts`
- Modify: `src/config/tracks.ts` (`signage?: 'real' | 'generic'`, default generic; Ikorodu `'real'`)

**Interfaces:**
- Produces: `type Sign = { id: string; text: string[]; colors: { bg: string; fg: string }; where: string; source: string; status: 'verified' }`.
- Produces: `IKORODU_SIGNS: Sign[]` containing only the verified rows of the spec: `mosque` "ORIWU CENTRAL MOSQUE, IKORODU" (cream, dark); `ap` "ap" (green, white); `autocad` "AutoCAD" (flyer hoarding); `tcl` "TCL" (red, white); `kfc` "KFC" (red, white, lettering only); `paypoint` "REVENUE" / "PAY POINT" (red, white); `tailoring` "TAILORING" / "WEDDING SUITS" / "FASHION" (blue, white). Each has a `where` and `source` copied from the spec.
- Produces: `signsFor(cfg: TrackConfig): Sign[]` returning `[]` unless `cfg.id === 'ikorodu' && cfg.signage === 'real'`.

- [ ] **Step 1: Failing tests** (`signs.test.ts`):
  - `generic signage returns no signs`: `signsFor({ ...trackById('ikorodu'), signage: 'generic' })` is `[]`.
  - `real signage returns the seven verified signs`: ids match the list above.
  - `no unverified text`: no sign's text contains "IKOR", "KD Lounge", "ZENITH", "BUILDER", "chicken", "General Hospital", "EXCLUSIVE" or "ETHNIC".
  - `every sign has a source and a where`.
  - `ojuelegba has no signs`: `signsFor(trackById('ojuelegba'))` is `[]`.
- [ ] **Step 2: Run**; expected FAIL.
- [ ] **Step 3: Implement** the file and `signage` field. A comment at the top of the signs file lists the partial and OSM-only names as "not used until read", copied from the spec.
- [ ] **Step 4: Run** the tests; expected PASS.
- [ ] **Step 5: Commit** `git commit -m "Ikorodu: signs data (verified names only) and signage flag"`

### Task 5: Roundabout-end scenery with signs drawn

**Files:**
- Modify: `src/config/tracks.ts` (`ZoneKind` adds `'mosque'` and `'hoarding'`; the existing `'petrol'` zone gets a colour option), `src/scene/landmarks.ts`, `src/scene/scenery.ts`, `src/scene/art/textures.ts`

**Interfaces:**
- Consumes: `signsFor(cfg)` (Task 4), `petrolStation(m)` in `landmarks.ts:66`.
- Produces: `signTexture(sign: Sign): CanvasTexture` in `art/textures.ts` (bold lettering in `sign.colors`, one line per `text` entry, same canvas style as the `SHOP_SIGNS` atlas at `scenery.ts:115`; brand names are plain lettering only, no logo artwork).
- Produces: `mosque(m: MatFn, sign?: Sign): Group` (four minarets, gold dome, lettered front), `flyerHoarding(m: MatFn, sign?: Sign): Group`, and `petrolStation(m: MatFn, o?: { color?: string; sign?: Sign })` (green, "ap" on the canopy when a sign is given; no text when generic).
- Zones (roundabout end, axis ends at `L`): mosque on the left of the outbound approach over `[L-60, L-15]` (`street: 'south'` side so it is seen across the roundabout; confirm side against the spec: ENE of the junction), green petrol station `[L-70, L-40]` right side, hoarding on the roundabout approach `[L-30, L-12]`. Backdrop: red TCL building and blue terminal canopy behind the roundabout, outside the drivable area. Keep ordinary `buildings` elsewhere.

- [ ] **Step 1: Failing test** `real signage zones reference only existing signs`: for each zone of Ikorodu with a sign id, `signsFor(cfg)` contains it; with `signage: 'generic'` the scenery builder is given zero signs (test the pure helper `zoneSign(cfg, id): Sign | undefined`, exported from `scenery.ts`, returns undefined for generic).
- [ ] **Step 2: Run**; expected FAIL.
- [ ] **Step 3: Implement** the builders and wire the zone kinds in `buildScenery`'s zone loop (`scenery.ts:285-370`) so a missing sign draws the same building without lettering.
- [ ] **Step 4: Run** tests; `npm run build`. Preview: screenshot the approach to the roundabout at the mosque, the fuel station and the hoarding; compare by eye with the Street View stops listed in the spec, in both `signage` modes (generic must show no lettering).
- [ ] **Step 5: Commit** `git commit -m "Ikorodu: mosque, fuel station, hoarding and roundabout backdrop"`

### Task 6: Route-side scenery (Ayangburen Road, Beach Road, hospital)

**Files:**
- Modify: `src/config/tracks.ts` (zones), `src/scene/landmarks.ts`, `src/scene/scenery.ts`

**Interfaces:**
- Produces new zone kinds: `'ayangburen'`, `'beach'`, `'hospital'`; builders `hospitalBlocks(m, sign?)` (pink and yellow single-storey blocks, barred windows, covered walkway on dark posts, "REVENUE / PAY POINT" board when the sign exists), `kioskRow(m)` (blue kiosks), `solarLight(m)`, `tankerTruck(m)`, `shopfront(m, o: { sign?: Sign })` (old 2 to 3 storey shop with balcony and red corrugated awning; KFC and the blue tailoring board are shopfronts with a sign).
- Zone map (game metres along the axis from the hospital, `L` axis length; Ayangburen single road about 147 m, dual carriageway about 117 m, Beach Road about 147 m, hospital 10 m): hospital `[0, 40]` both sides; Beach Road `[10, 150]`: right side blue kiosks and trees, left side painted-kerb look with solar lights, generic shopfronts (the "chicken" sign is NOT used); Ayangburen single `[150, L-117]`: right side shopfronts with KFC at about 520 real m south of the roundabout (`L - 156`) and the tailoring board about 25 m closer; left side yellow 3-storey building with orange roof, pink perimeter wall, tanker truck near `L - 230`; dual carriageway `[L-117, L]`: rows of parked yellow keke on the right, shopfronts and water-sachet hawkers.
- Beach Road far end and west side are unsurveyed: generic shopfronts, stalls, walls and trees only.

- [ ] **Step 1: Failing test** `ikorodu zones stay inside the axis and cover both sides`: every zone range is within `[0, L]`, and both streets have coverage over at least 70% of the axis.
- [ ] **Step 2: Run**; expected FAIL.
- [ ] **Step 3: Implement** the builders and zone handling. Reuse `parkedDanfo`, the people system and the awning code; do not add textures larger than 512 px.
- [ ] **Step 4: Run** tests, `npm run build`. Preview screenshots at the four Ayangburen stops and the hospital, side by side with the spec's "Seen in Street View" table.
- [ ] **Step 5: Commit** `git commit -m "Ikorodu: Ayangburen Road, Beach Road and hospital scenery"`

### Task 7: Track picker and fallback

**Files:**
- Modify: `src/ui/Menu.tsx` (track line at `Menu.tsx:45`), `src/game/store.ts` (`track: string` at line 39; add `setTrack` if absent), `src/game/save.ts`
- Test: `src/game/save.test.ts`

**Interfaces:**
- Produces: `setTrack(id: string): void` in the store; `trackById` stays exported and gains a safe variant `trackOrDefault(id: string): TrackConfig` in `tracks.ts` (returns `ojuelegba` for an unknown id). `RaceScene.tsx:36` and `Menu.tsx` use it.
- Persist the chosen track in the save (`track?: string`); `normalise` drops unknown ids.

- [ ] **Step 1: Failing tests**: `trackOrDefault returns ojuelegba for an unknown id`; `normalise drops an unknown saved track id`; `best laps are kept per track` (finishRace with two tracks, two bests).
- [ ] **Step 2: Run**; expected FAIL.
- [ ] **Step 3: Implement**; in the menu, replace the track line with two cards (name, blurb, laps, best lap) that call `setTrack`. Touch targets at least 44 px, check at 844x390.
- [ ] **Step 4: Run** tests and `npm run build`; preview the menu at phone size, switch tracks, start a race on each.
- [ ] **Step 5: Commit** `git commit -m "Track picker with saved choice and a safe fallback"`

### Task 8: Play-tests, docs and sign-off

**Files:**
- Modify: `scripts/playtest.mjs` (add a `--track=ikorodu` argument if it has none; read its `args` handling at line 19), `README.md`, `CLAUDE.md`

- [ ] **Step 1: Run** the autopilot play-test for each vehicle (Okada, Keke, Danfo, BRT) on `ikorodu` at 844x390, low and high quality. Expected: all finish 3 laps, no respawns at either U-turn, no two vehicles overlapping for more than 0.3 s at the start; FPS on low no worse than Ojuelegba. Fix tuning (turn radius, splay) rather than loosening the checks.
- [ ] **Step 2: Run** `node scripts/track-report.ts ikorodu` and `npm test` and `npm run build`; all pass.
- [ ] **Step 3: Update docs.** `README.md`: tracks list, picker, OSM credit. `CLAUDE.md`: add Ikorodu to Tracks, and record the deliberate exception: this track uses real business and place names as lettering only, read off signs, switchable with `signage: 'generic'`; note the trademark risk and that sign text came from Street View, which stays "only for looking", so the user should confirm signage from their own photos before shipping.
- [ ] **Step 4: Take** side-by-side screenshots (game vs Street View stop) for the user; list the unsurveyed stretches.
- [ ] **Step 5: Commit** `git commit -m "Ikorodu: play-tests, README and CLAUDE.md"`

---

## Self-review

- Spec coverage: route/scale/laps (T1), two legs and median styles (T1, T2), roundabout and hospital U-turns plus invented flag (T3), signs data, flag, verified-only (T4), mosque/fuel/hoarding/backdrop (T5), Ayangburen/Beach/hospital scenery (T6), picker and best laps (T7), testing, docs and exception (T8). Out-of-scope items (Sagamu Road, back streets, BRT terminal as drivable) are not tasks.
- Open decisions for the user, not blocking: the sign text came from Street View (see spec, "Open questions"); the island is about 6 m, not 12 m (Task 3 note).
- Plan length is a fraction of the spec's code surface; builders are named by signature and look, not code.
