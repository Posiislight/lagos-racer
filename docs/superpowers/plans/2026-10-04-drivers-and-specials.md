# Drivers and Special Powers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Players pick a driver (Moshood or Mama Put) who sits in the vehicle and has one special power, fired from a charge meter with its own button.

**Architecture:** Driver data and every special-power number live in `src/config/drivers.ts`. A new pure module `src/game/specials.ts` runs the meter, Push Squad, Pepper Soup Trail and cough, called next to `updateItems`. Drivers are built into the vehicle models through the existing `reference/sporty` → `scripts/sync-models.mjs` pipeline so the merge step keeps draw calls low.

**Tech Stack:** Vite, React, TypeScript, zustand, React Three Fiber + Rapier, Vitest (`npm test` runs `vitest run`; `npm run typecheck`).

**Spec:** `docs/superpowers/specs/2026-10-04-drivers-and-specials-design.md`. The concept page for the looks is `reference/characters-showroom.html`.

**Code state this plan was written against** (main, after the paints and Ojuelegba merges): four vehicle ids (`okada`, `keke`, `danfo`, `brt`) each with `paints`; `makeRacer(id, name, vehicle, paint, isPlayer, progress)`; `makeRace(trackId, player: Pick)` with `Pick = { vehicle, paint }` from `src/game/lineup.ts`; saves in `src/game/save.ts` (key `lagos-racer:v2`); the power-up button lives in `Hud.tsx`; screen effects go through `src/game/fx.ts`, `FxBridge.tsx` and `ScreenFx.tsx`; `buildVehicleModel(id, color, scale?, opts)`. If any of that has changed again, re-read it before starting a task.

## Global Constraints

- Charge time 30 s for both drivers; charge runs only while `race.phase === 'racing'` and the racer has not finished.
- Push Squad: 4 s, top speed ×1.18, acceleration ×1.6, stacks with fuel.
- Pepper Soup Trail: trail 5 s; a patch every 3.5 m travelled; patch life 9 s, radius 2.0 m; at most 40 patches per use.
- Cough: 2.4 s scaled by the existing `lasting()` rule; top speed ×0.7, acceleration ×0.7, steering swerve; 1 s immunity after; odeshi blocks it; a racer's own trail never hurts that racer.
- Controls: keyboard **Q**; touch Special button in the HUD directly beside the power-up button (the spec said "above" it in `TouchControls`, but the power-up button has since moved into the HUD), same size, with a conic charge ring; the HUD is refreshed by the existing 0.1 s tick.
- Default driver Moshood; a missing or unknown saved driver falls back to it. The save key stays `lagos-racer:v2`.
- AI: random driver each; fires after a 0.5 to 2 s delay once ready. Moshood needs low curvature 25 m ahead (`< 0.02`, same as fuel); Mama Put needs a rival within 30 m behind. Both fire anyway after waiting 10 s ready (the spec says this for Mama Put; applying it to Moshood too so a bendy track cannot strand it).
- No real brand logos or celebrity names. Characters are parodies.
- A vehicle with a driver must not draw noticeably more than without (at most 8 extra meshes after merging).
- Never edit `src/models/generated/showroom.js` by hand. Change `reference/sporty/` and run `node scripts/sync-models.mjs`.
- The upgrades plan (`2026-10-04-vehicle-upgrades.md`) also edits `store.ts`, `save.ts`, `Garage.tsx`, `RaceLogic.tsx` and `Vehicle.tsx`. The two are independent; whichever lands second merges small edits.

## Review Focus

- Special pressed during the countdown, after finishing, with the meter not full, or with no physics body: nothing fires and the charge is not spent (Task 2).
- Item and special pressed on the same frame: both fire and neither cancels the other (Task 2).
- A stationary racer with the trail active drops no patches, and a very fast one never exceeds 40 per use (Task 2).
- Two racers both playing Mama Put: each is safe from her own soup but coughs on the other's (Task 2).
- A saved `driver` that is missing, `7`, `null` or `"bob"` loads as Moshood without crashing (Task 1).

## File Structure

| File | Responsibility |
|---|---|
| `src/config/drivers.ts` (new) | `DriverId`, `DriverConfig`, `DRIVERS`, `SPECIALS` numbers, `DEFAULT_DRIVER`, `driverById`, `sanitizeDriver`, `randomDriver` |
| `src/game/specials.ts` (new) | `updateSpecials`, `speedFactors` |
| `src/game/testkit.ts` (new) | Shared test helpers `track`, `racerAt`, `raceWith` (moved out of `items.test.ts`) |
| `src/game/runtime.ts` | New `Racer` and `AIState` fields, `Hazard` kind `'soup'`, `aiState` helper |
| `src/game/items.ts` | Export `lasting`; limit the oil branch to `kind === 'oil'` |
| `src/game/ai.ts` | `aiSpecial` and its use in `driveAI` |
| `src/game/input.ts`, `store.ts`, `save.ts`, `fx.ts`, `audio.ts` | `special` control and Q key; saved driver and HUD `special`; `fx.cough`; new sounds |
| `src/scene/Vehicle.tsx`, `Effects.tsx`, `FxBridge.tsx`, `RaceScene.tsx`, `RaceLogic.tsx` | Physics factors, visuals, race setup, wiring |
| `src/ui/Hud.tsx`, `ScreenFx.tsx`, `Garage.tsx`, `Menu.tsx`, `Preview.tsx`, `src/styles.css` | Special button and ring, cough screen, driver picker, previews |
| `reference/sporty/core.js`, `vehicles/*.js`, `scripts/sync-models.mjs`, `src/models/*` | `driverFigure`, driver in each vehicle, model option |

---

## Chunk 1: Gameplay

### Task 1: Driver config and saved choice

**Files:**
- Create: `src/config/drivers.ts`, `src/config/drivers.test.ts`
- Modify: `src/game/save.ts` (`Saved`, `defaultSave`, `normalise`), `src/game/save.test.ts`, `src/game/store.ts` (`State`, `save()`)

**Interfaces:**
- Produces:
  - `type DriverId = 'moshood' | 'mamaput'`; `type SpecialKind = 'push' | 'soup'`
  - `type DriverConfig = { id: DriverId; name: string; role: string; blurb: string; special: { kind: SpecialKind; name: string; chargeTime: number } }`
  - `DRIVERS: DriverConfig[]`, `DEFAULT_DRIVER: DriverId`, `driverById(id: DriverId): DriverConfig`
  - `SPECIALS = { push: { duration: 4, topSpeed: 1.18, accel: 1.6 }, soup: { duration: 5, spacing: 3.5, patchLife: 9, radius: 2, maxPatches: 40, cough: 2.4, coughSpeed: 0.7, immunity: 1 } }`
  - `sanitizeDriver(v: unknown): DriverId` (anything not a known id becomes `DEFAULT_DRIVER`)
  - `randomDriver(rand?: () => number): DriverId`
  - `Saved.driver: DriverId`; store `setDriver(d: DriverId): void`

- [ ] **Step 1: Write failing tests.** In `src/config/drivers.test.ts`:
  - every `DRIVERS` entry has `special.chargeTime > 0` and a kind of `'push'` or `'soup'`; ids are unique;
  - `driverById('mamaput').special.kind === 'soup'` and `driverById('moshood').special.kind === 'push'`;
  - `sanitizeDriver` returns `'moshood'` for `undefined`, `null`, `7`, `'bob'`, `{}` and `'mamaput'` for `'mamaput'`;
  - `randomDriver(() => 0)` is `'moshood'`, `randomDriver(() => 0.99)` is `'mamaput'`.

  In `src/game/save.test.ts` add a `describe('driver')` using `migrateSave` (it passes its input through `normalise`): `migrateSave({ driver: 'mamaput' }).driver` is `'mamaput'`; `migrateSave({ driver: 7 }).driver`, `{ driver: null }`, `{ driver: 'bob' }` and `{}` are all `'moshood'`; `defaultSave().driver` is `'moshood'`.
- [ ] **Step 2: Run** `npx vitest run src/config/drivers.test.ts src/game/save.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `src/config/drivers.ts` as above. Moshood: role `Agbero`, special `Push Squad`, `chargeTime: 30`. Mama Put: role `Food seller`, special `Pepper Soup Trail`, `chargeTime: 30`. Blurbs are one sentence each from the spec's driver descriptions.
- [ ] **Step 4: Save and store.** Add `driver: DriverId` to `Saved` and `defaultSave()` (`DEFAULT_DRIVER`); in `normalise` use `driver: sanitizeDriver(raw.driver)`. In `store.ts` add `setDriver` (`set({ driver }); save()` like `setVehicle`) and include `driver: s.driver` in the object `save()` passes to `writeSave`.
- [ ] **Step 5: Run** `npx vitest run && npm run typecheck`. Expected: PASS.
- [ ] **Step 6: Commit** `git add src/config src/game && git commit -m "Add driver config and saved driver choice"`

### Task 2: Special-power logic

**Files:**
- Create: `src/game/specials.ts`, `src/game/specials.test.ts`, `src/game/testkit.ts`
- Modify: `src/game/runtime.ts`, `src/game/items.ts`, `src/game/items.test.ts`, `src/game/input.ts` (only the `Controls` type and `emptyControls`), `src/scene/RaceScene.tsx` and `src/scene/RaceLogic.tsx` (only their `ai = { ... }` literals)

**Interfaces:**
- Consumes: Task 1 (`DriverId`, `DEFAULT_DRIVER`, `SPECIALS`).
- Produces:
  - `Racer` gains `driver: DriverId; charge: number; push: number; cough: number; trail: number; trailDist: number`
  - `makeRacer(id, name, vehicle, paint, isPlayer, progress, driver: DriverId = DEFAULT_DRIVER)`
  - `Hazard['kind']` becomes `'oil' | 'juju' | 'soup'`; `Puff['color']` gains `'steam'`
  - `Controls.special: boolean`
  - `AIState` gains `specialDelay: number; specialWait: number`; `aiState(lane: number, skill: number, itemDelay?: number, laneTarget?: number): AIState` replaces the two `r.ai = { ... }` literals (`RaceScene.tsx` `makeRace`, `RaceLogic.tsx` fallback) so the new required fields never break the typecheck
  - `updateSpecials(race: RaceRuntime, dt: number, flash: (m: string) => void): void`
  - `speedFactors(r: Pick<Racer, 'boost' | 'curse' | 'push' | 'cough'>): { accel: number; top: number }`
  - `items.ts` exports `lasting(r: Racer, base: number): number`
  - `testkit.ts` exports `track`, `racerAt(id, s, isPlayer?)`, `raceWith(racers)`

- [ ] **Step 1: Extract the helpers.** Move `control`, `track`, `racerAt` and `raceWith` out of `items.test.ts` into `src/game/testkit.ts` (exported; `racerAt` keeps calling `makeRacer` with `VEHICLES[0]` and `VEHICLES[0].paints[0]`); `items.test.ts` imports them. Run `npx vitest run src/game/items.test.ts`. Expected: PASS unchanged.
- [ ] **Step 2: Write failing tests** in `src/game/specials.test.ts` (use `racerAt`, `raceWith`, `vi.fn()` for `flash`; set `r.driver`, `r.charge` and `r.speed` directly):
  - `charges at 1/30 per second only while racing`: `race.phase = 'countdown'`, `updateSpecials(race, 1, flash)` leaves `charge` 0; with `phase = 'racing'`, 15 s gives `toBeCloseTo(0.5, 2)`, a further 30 s gives exactly 1.
  - `does not charge once finished`: `progress.finishTime = 12` leaves `charge` 0.
  - `needs a full meter`: `charge = 0.5`, `controls.special = true` → `push` 0, `charge` 0.5, `controls.special` false afterwards.
  - `does nothing in the countdown or without a body`: `charge = 1`, phase `'countdown'` (then `body = null`) → `push` 0, `charge` 1.
  - `Push Squad`: Moshood, `charge = 1` → `push` equals `SPECIALS.push.duration`, `charge` 0; after 4.1 s `push` is 0.
  - `item and special in the same frame`: `item = 'fuel'`, `charge = 1`, both `controls.useItem` and `controls.special` set; call `updateItems(race, 0.016, flash)` then `updateSpecials(...)`; `boost > 0`, `push > 0`, `item` null.
  - `soup trail drops a patch every 3.5 m behind the car`: Mama Put, `charge = 1`, `speed = 28`, fire, then eight frames of `dt = 0.1` → between 7 and 9 `soup` hazards; every patch has `x` less than the body's `x` (the stand-in body faces +x) and `owner` equal to the racer id.
  - `a stationary trail drops nothing`: `speed = 0`, 3 s of frames → 0 soup hazards.
  - `trail stops after 5 s and never exceeds 40 patches`: `speed = 100`, 7 s of frames → `trail` 0 and soup hazard count `<= SPECIALS.soup.maxPatches`.
  - `cough`: a soup hazard at a victim's position, owner another racer → `victim.cough` `toBeCloseTo(SPECIALS.soup.cough * (1.25 - 2 * 0.055), 2)` (the test vehicle's toughness is 2), `victim.immune > 0`, `flash` called for the player victim.
  - `odeshi blocks it`: `shield = 5` → `cough` 0, `immune` 0.
  - `never hurts its owner, but another Mama Put's soup does`: two Mama Puts; a patch owned by A leaves A's `cough` 0 and gives B a cough.
  - `speedFactors`: all zero → `{accel:1,top:1}`; boost → `{2.2,1.3}`; curse → `{0.55,0.62}`; push → `{1.6,1.18}`; cough → `{0.7,0.7}`; boost and push together multiply (`accel` 3.52, `top` `toBeCloseTo(1.534, 3)`).
  - in `items.test.ts`: `a soup patch does not act like crude oil`: a soup hazard under a racer, `updateItems` → `slip` 0.
- [ ] **Step 3: Run** `npx vitest run src/game`. Expected: the new tests FAIL (module and fields missing).
- [ ] **Step 4: Runtime changes** in `runtime.ts` as listed under Interfaces (new `Racer` fields default to 0, `driver` to the given one; `aiState` sets `specialDelay: -1`, `specialWait: 0`, `itemDelay` default 2, `laneTarget` default equal to `lane`, `stuck` and `reverseTime` 0). Replace both literals with `aiState(...)` using the values each literal had today (`RaceScene`: skill `0.9 + k * 0.035 + Math.random() * 0.03`, item delay 2, lane target = lane; `RaceLogic`: lane `r.progress.lateral`, lane target 0, skill 0.95, item delay 3).
- [ ] **Step 5: `items.ts`:** export `lasting`; change the hazard loop's `else` branch (the oil one) to `else if (h.kind === 'oil')`.
- [ ] **Step 6: Implement `updateSpecials` and `speedFactors`** in `specials.ts`. Per racer, in this order: (1) charge while racing and unfinished; (2) fire when `controls.special` and `charge >= 1` and phase is `'racing'` and the racer has a body (set `push` or `trail`, reset `charge`, `sfx('push' | 'soup')` for the player; if not ready and a player, `sfx('notReady')`); always clear `controls.special`; (3) count `push`, `cough`, `trail` down; end `push` and `trail` when finished; (4) while `trail > 0` add `Math.abs(r.speed) * dt` to `trailDist` and drop one patch per `spacing` (hazard: `kind 'soup'`, placed behind the car the way the oil slick is but 1 m closer, `life` `patchLife`, `armed` 0, `ground` from the track point; a puff of colour `'steam'` every second patch), never exceeding `maxPatches` per use; (5) soup hits: for every `soup` hazard and every racer with a body that is not its owner, has `shield <= 0` and `immune <= 0`, within `radius`: `cough = lasting(r, SPECIALS.soup.cough)`, `immune = cough + SPECIALS.soup.immunity`, `sfx('cough')` and `flash('COUGH!')` for the player. `speedFactors` returns the products of the boost, curse, push and cough factors from the constants in the tests above. `sfx` accepts the four new names from this task on (extend its union and add silent-safe cases now; Task 4 gives them sounds).
- [ ] **Step 7: Run** `npx vitest run src/game && npm run typecheck`. Expected: PASS.
- [ ] **Step 8: Commit** `git add -A src/game src/scene && git commit -m "Add special-power logic: meter, Push Squad, Pepper Soup Trail"`

### Task 3: Vehicle physics and respawn

**Files:** Modify `src/scene/Vehicle.tsx` (the physics step where `boosting`, `cursed` and `slippy` are set, and `respawn`).

**Interfaces:** Consumes `speedFactors` (Task 2). Produces nothing new.

- [ ] **Step 1:** Replace the inline `boosting ? 2.2 : 1`, `cursed ? 0.55 : 1`, `boosting ? 1.3 : 1`, `cursed ? 0.62 : 1` factors with `const f = speedFactors(racer)`; `perWheel = t.mass * t.accel / 4 * f.accel`, `top = t.topSpeed * racer.topBoost * f.top`. Keep the fuel impulse keyed on `boosting` but compare against `t.topSpeed * f.top`.
- [ ] **Step 2:** While `racer.cough > 0` add `Math.sin(race.clock * 7 + racer.id * 3) * 0.3 * Math.min(1, racer.cough)` to `steerIn`.
- [ ] **Step 3:** In `respawn`, set `racer.trail = 0`.
- [ ] **Step 4: Verify** `npm run typecheck && npx vitest run`. Expected: PASS. (Driving feel is checked in Task 7.)
- [ ] **Step 5: Commit** `git commit -am "Use speedFactors in the vehicle physics; cough swerve; respawn ends a trail"`

### Task 4: Control, HUD state, sounds and race wiring

**Files:**
- Modify: `src/game/input.ts`, `src/game/input.test.ts`, `src/game/store.ts` (`Hud`, `emptyHud`), `src/scene/RaceLogic.tsx`, `src/scene/RaceScene.tsx`, `src/game/audio.ts`, `src/game/fx.ts`, `src/scene/FxBridge.tsx`

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces:
  - `touch.special: boolean`; `queueSpecial(): void`; `readPlayer` sets `out.special`
  - `Hud` gains `special: { name: string; charge: number; ready: boolean }`
  - `fx.cough: number` (0..1, eased like `fx.slip`), reset by `resetFx`
  - `makeRace(trackId: string, player: Pick, playerDriver: DriverId)`

- [ ] **Step 1: Write failing tests** in the existing `src/game/input.test.ts`: with `touch.special = true`, `readPlayer(controls, 0.016, { tilt: false, invertTilt: false })` sets `controls.special` true and clears `touch.special`; after `queueSpecial()` the next `readPlayer` sets it and a second call does not.
- [ ] **Step 2: Run** `npx vitest run src/game/input.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the input pieces; `KeyQ` calls `queueSpecial` in `startKeyboard`, beside the line that queues items.
- [ ] **Step 4: Race wiring.** In `RaceLogic.tsx` call `updateSpecials(race, dt, m => store.flash(m))` every frame (not behind the countdown guard `updateItems` uses, so the meter logic sees the countdown); in the 0.1 s HUD block add `special: { name: driverById(player.driver).special.name, charge: player.charge, ready: player.charge >= 1 }`. In `RaceScene.tsx` `makeRace` takes `playerDriver`, passes it to the player's `makeRacer` and gives each rival `randomDriver()`; the `useMemo` reads `driver` from the store and lists it in its dependencies. `emptyHud` gets `special: { name: '', charge: 0, ready: false }`.
- [ ] **Step 5: Cough screen state.** In `FxBridge.tsx` ease `fx.cough` toward 1 while `p.cough > 0` (in over 0.2 s, out over 0.5 s) exactly as `fx.slip` is done; reset it in `resetFx`.
- [ ] **Step 6: Audio.** Give the four new `sfx` names sounds with the existing `tone`/`noise` helpers: `push` a rising three-note chirp, `soup` a short hiss, `cough` two low noise bursts, `notReady` one low short `square` tone.
- [ ] **Step 7: Run** `npx vitest run && npm run typecheck`. Expected: PASS.
- [ ] **Step 8: Commit** `git add -A src && git commit -m "Wire the special control, HUD state, audio and race setup"`

### Task 5: AI uses specials

**Files:** Modify `src/game/ai.ts`, `src/game/ai.test.ts` (extend; it already tests `sideStep`).

**Interfaces:** Consumes `aiState`, `Racer.charge`, `Racer.driver`, `testkit`. Produces `aiSpecial(r: Racer, race: RaceRuntime, dt: number, rand?: () => number): boolean`; `driveAI` sets `c.special = aiSpecial(...)`.

- [ ] **Step 1: Write failing tests** in a new `describe('aiSpecial')` (racers from `racerAt`, `r.ai = aiState(0, 1)`, `rand = () => 0` so the delay is 0.5 s; on the testkit track the first straight covers `s` 0 to 50, so `s = 5` has a straight 25 m ahead and `s = 60` has a bend ahead):
  - `never fires with a part-charged meter` (`charge = 0.5`).
  - `Moshood fires on a straight after the short delay`: `charge = 1` at `s = 5`; false after `dt = 0.3`, true after a further 0.3.
  - `Moshood holds fire in a bend` until the 10 s wait, then fires: false at 9 s, true at 10.5 s.
  - `Mama Put fires with a rival within 30 m behind`: a second racer 20 m behind; true after the delay.
  - `Mama Put waits with nobody behind, then fires after 10 s`: false at 9 s, true at 10.5 s.
  - `the delay restarts for the next charge`: after `charge` drops below 1 and refills, `specialDelay` is set fresh (not left at its old value).
- [ ] **Step 2: Run** `npx vitest run src/game/ai.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `aiSpecial`: when `charge < 1` set `specialDelay = -1`, `specialWait = 0`, return false; when ready and `specialDelay < 0` set it to `0.5 + rand() * 1.5`; then `specialDelay -= dt`, `specialWait += dt`; return false while `specialDelay > 0`; otherwise Moshood true on a straight (`Math.abs(curvature at s + 25) < 0.02`), Mama Put true when any other racer has `-30 < gap < -3` (gap = their `progress.distance` minus ours), and both true once `specialWait > 10`. Call it from `driveAI` after the item block.
- [ ] **Step 4: Run** `npx vitest run && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `git add -A src/game && git commit -m "AI drivers fire their specials by rule"`

### Task 6: Special button, meter and cough screen

**Files:** Modify `src/ui/Hud.tsx`, `src/ui/ScreenFx.tsx`, `src/styles.css`.

**Interfaces:** Consumes `hud.special`, `queueSpecial`, `touch.special`, `fx.cough`, `useIsTouch` (from `TouchControls.tsx`).

- [ ] **Step 1: Special button.** In `Hud`, next to the `.hud-item` button, add a round `.hud-special` button (`pointer-events: auto`, same size as `.hud-item` including its larger `(pointer: coarse)` size, positioned directly left of it) whose pointer-down calls `queueSpecial()`; it shows the special's initial and a conic-gradient ring driven by a `--charge` CSS variable (0 to 1); a `ready` class makes it glow and pulse (disabled under `prefers-reduced-motion`, as `.hud-item.full` is). `aria-label` is `Special: <name>` plus `, ready` when ready.
- [ ] **Step 2: Keyboard hint.** On non-touch devices show a small "Q" cap on the button.
- [ ] **Step 3: Cough screen.** In `ScreenFx.tsx` add a `.fx-cough` layer driven by `fx.cough` the same way the oily edges are driven by `fx.slip`: an orange-red radial vignette, plus `backdrop-filter: blur(2px)` only when `fx.quality !== 'low'`.
- [ ] **Step 4: Verify in the browser** at a phone viewport (`preview_start` with the dev server, `resize_window` mobile, then reset to desktop): the Special button sits beside the power-up button without overlapping the pause button or the steer zones, the ring fills during a race, `Q` and a tap both fire once full. Screenshot as proof.
- [ ] **Step 5: Commit** `git add -A src && git commit -m "Add the Special button, charge ring and cough screen"`

### Task 7: Effects and sounds in play

**Files:** Modify `src/scene/Effects.tsx`, `src/scene/Vehicle.tsx` (`effectMeshes` and the per-frame fx block).

**Interfaces:** Consumes `Hazard` kind `'soup'`, `Puff` colour `'steam'`, `racer.push`.

- [ ] **Step 1: Soup patches.** In `Effects`, add an instanced mesh for `soup` hazards (own cap `MAX_SOUP = 160`, radius `SPECIALS.soup.radius`, red-brown radial texture made with `canvasTex` like the oil slick); skip any beyond the cap. Add `steam` to the `PUFF` colour map (pale warm white).
- [ ] **Step 2: Push boys.** In `Vehicle.tsx`'s `effectMeshes`, add a group of three small figures (capsule body, sphere head, different shirt colours) behind the vehicle at `-(length / 2 + 0.8)`, spread across its width; visible only while `racer.push > 0`, bobbing with `Math.sin(clock * 14 + i)`.
- [ ] **Step 3: Verify in the browser.** Temporarily set both `chargeTime` values in `drivers.ts` to 3, start a race (`?autopilot=1`), and watch both specials fire on AI cars and the player: soup patches appear behind Mama Put and slow a car driving through; the boys appear behind Moshood. Screenshot each. Restore `chargeTime: 30` and confirm with `git diff src/config/drivers.ts` that the file is unchanged.
- [ ] **Step 4: Commit** `git add -A src && git commit -m "Draw soup patches, steam and the pushing boys"`

### Task 8: Driver picker and menu

**Files:** Modify `src/ui/Garage.tsx`, `src/ui/Menu.tsx`, `src/styles.css`.

**Interfaces:** Consumes `DRIVERS`, `driverById`, store `driver`, `setDriver`.

- [ ] **Step 1:** In `Garage`, add a "Driver" `role="tablist"` row under the vehicle tabs: one card per driver showing name, role, special name, blurb and "Charges in 30 s" (from `chargeTime`); the selected driver has `aria-selected`; clicking calls `setDriver`. The preview does not change yet.
- [ ] **Step 2:** `Menu` shows the driver's name next to the vehicle name wherever it shows the vehicle now.
- [ ] **Step 3: Verify** at a phone viewport: the row scrolls or wraps without horizontal page scroll; the choice survives a reload (`localStorage`); a race started from the Menu uses the saved driver (the HUD button shows that driver's initial). Screenshot.
- [ ] **Step 4: Run** `npx vitest run && npm run typecheck && npm run build`. Expected: all succeed.
- [ ] **Step 5: Commit** `git add -A src && git commit -m "Add the driver picker to the Garage and Menu"`

---

## Chunk 2: Characters on the vehicles

### Task 9: `driverFigure` and the face options

**Files:** Modify `reference/sporty/core.js` (`person`, new `DRIVER_LOOKS`, `driverFigure`), `scripts/sync-models.mjs` (export list), `src/models/generated/showroom.d.ts`; regenerate `src/models/generated/showroom.js`.

**Interfaces:** Produces `driverFigure(id: string, seat?: Record<string, unknown>): Group` (generated module). `seat` carries pose options the vehicle owns: `hands`, `ankle`, `pose`, `wave`.

- [ ] **Step 1: Port the person options.** Add to `person()` in `core.js` the options from the concept page's `person()`: `shorts` (bare lower legs), `shoe` (colour), `mustache`, `angry` (0, 1, 2: slanted brow groups, skin-coloured lids, small pupils, frown, shouting mouth for 2), and set `g.userData.head = head`. Keep the line `head.add(sph(.2,skin,0,0,0,28));` unchanged (the sync script's lite patch matches it).
- [ ] **Step 2: Add `DRIVER_LOOKS` and `driverFigure`.** `DRIVER_LOOKS.moshood = { person: { shirt: '#d9c76a', arms: 'bare', pants: '#3a4a66', shorts: true, shoe: '#2d7dd2', mustache: true, angry: 2, skin: MAT.skin1 }, build: [.95, 1.04, .85] }`; `DRIVER_LOOKS.mamaput = { person: { shirt: DRIVER_ANKARA, arms: 'bare', pants: DRIVER_ANKARA, skin: MAT.skin2, gele: DRIVER_ANKARA, shoe: '#6b3d9a', angry: 1 }, build: [1, 1, 1.12] }`, with `DRIVER_ANKARA` the red-and-gold material from the concept page, defined as its own constant so the existing `ANKARA`/`ANKARA2` (and every vehicle that uses them) do not change. `driverFigure(id, seat)` builds `person({ ...look.person, ...seat })` and applies `build` as the group scale; an unknown id throws.
- [ ] **Step 3:** Add `'driverFigure'` to the export list in `scripts/sync-models.mjs` and its type to `showroom.d.ts`; run `node scripts/sync-models.mjs`. Expected: `wrote src/models/generated/showroom.js`, with no new `lite: pattern not found` warnings compared with running it before this change.
- [ ] **Step 4: Verify** `npm run typecheck`. The figure itself is checked in Task 11, once a vehicle uses it.
- [ ] **Step 5: Commit** `git add reference/sporty scripts src/models && git commit -m "Add driverFigure and angry-face options to the model builders"`

### Task 10: Drivers in each vehicle

**Files:** Modify `reference/sporty/vehicles/okada.js`, `keke.js`, `danfo.js`, `brt.js`; regenerate `showroom.js`; update `showroom.d.ts`.

**Interfaces:** Consumes `driverFigure`. Produces `buildOkada(body?: string, driver?: string)`, `buildKeke(bodyColor?: string, driver?: string)`, `buildDanfo(bodyColor?: string, driver?: string)`, `buildBRT(lowerColor: string, number: string, driver?: string)`. With `driver` undefined every builder keeps its existing figure, so the showroom pages still work.

- [ ] **Step 1: Okada.** Where `rider = person({... hands, ankle})` is built, use `driver ? driverFigure(driver, { hands, ankle }) : person({...original})`, passing the same `hands` and `ankle` expressions; keep `fixedChild(g, rider, RP[0], RP[1], 0, 0, LEAN)`.
- [ ] **Step 2: Keke.** Same for the first `kekeRider(...)` call (the driver, with the green helmet); keep its `hands`/`ankle`; passengers stay.
- [ ] **Step 3: Danfo.** Replace the `drv = person({...})` that supplies the head at the window with `driver ? driverFigure(driver, {}) : person({...original})`; the code that follows takes its head group and positions it, so the head's face is what shows.
- [ ] **Step 4: BRT.** Replace the conductor's `person(...)` with `driver ? driverFigure(driver, { pose: 'stand', hands: { L: [-.19, .87, .37] }, wave: 'R' }) : person({...original})`; keep the scale, `userData.wave.userData.noBake`, `brtBake` and the wave animation.
- [ ] **Step 5:** Run `node scripts/sync-models.mjs`, update the d.ts signatures, and confirm `reference/sporty/index.html` still opens without console errors (it passes no driver).
- [ ] **Step 6: Commit** `git add reference/sporty src/models && git commit -m "Let every vehicle builder seat a driver character"`

### Task 11: Drivers in the game and the previews

**Files:** Modify `src/models/index.ts`, `src/scene/Vehicle.tsx`, `src/ui/Preview.tsx`, `src/ui/Garage.tsx`, `src/ui/Menu.tsx`.

**Interfaces:** Produces `buildVehicleModel(id: VehicleId, color: string, scale?: number, opts?: { merge?: boolean; shadowProxy?: boolean; driver?: DriverId })`; `Preview` takes `{ id: VehicleId; color: string; driver: DriverId }`; dev-only `window.__meshCount(id: string, driver?: string): number` (counts `Mesh` objects in a built, merged model).

- [ ] **Step 1:** In `src/models/index.ts` change `BUILDERS` to `(color: string, driver?: DriverId) => Group` (`okada: (c, d) => buildOkada(c, d)`, `brt: (c, d) => buildBRT(c, '01', d)`, and so on) and pass `opts.driver`.
- [ ] **Step 2:** In `Vehicle.tsx` pass `driver: racer.driver` and add `racer.driver` to the memo dependencies; in `Preview.tsx` and its callers (`Garage`, `Menu`) pass the saved `driver` and key the model memo on it.
- [ ] **Step 3: Dev helper.** Add `window.__meshCount` in `src/models/index.ts`, guarded by `import.meta.env.DEV`.
- [ ] **Step 4: Verify in the browser** (dev server): in the Garage, cycle all four vehicles with each driver and confirm each shows that driver (screenshots of Okada, Keke, Danfo and the BRT with each) with no console errors; Danfo shows the driver's face at the window; the BRT shows the character waving at the door. In the console compare `__meshCount(id, 'moshood')`, `__meshCount(id, 'mamaput')` and `__meshCount(id)` for all four: each driver variant is within 8 meshes of the no-driver count. Then start a race with `?autopilot=1` and confirm AI vehicles show mixed drivers.
- [ ] **Step 5: Run** `npx vitest run && npm run typecheck && npm run build`. Expected: PASS.
- [ ] **Step 6: Commit** `git add -A src && git commit -m "Show the chosen driver on the vehicle in races and previews"`

---

## Chunk 3: Docs

### Task 12: Update the project docs

**Files:** Modify `docs/superpowers/specs/2026-10-03-multiplayer-design.md`, `docs/superpowers/plans/2026-10-03-multiplayer.md`, `CLAUDE.md`, `README.md`.

- [ ] **Step 1: Multiplayer spec and plan.** Add (a) to the Items table: `use` kinds `'push'` and `'soup'` (soup patches are spawned by each phone along the owner's car, no per-patch messages; victims send `hit`); (b) to Car snapshots: the flags byte gains `push` and `cough` bits (full byte); (c) to the start message: each car's `driverId`; and put matching one-line notes in the plan's protocol, items and lobby tasks.
- [ ] **Step 2: `CLAUDE.md`.** In Vehicles add a short "Drivers" note (Moshood, Mama Put, specials, picker) and add Push Squad and Pepper Soup Trail under Power-ups as driver specials; keep the rest unchanged.
- [ ] **Step 3: `README.md`.** Add `src/config/drivers.ts` and `src/game/specials.ts` to the layout section and a line about `driverFigure` in the model notes.
- [ ] **Step 4: Commit** `git add CLAUDE.md README.md docs && git commit -m "Document drivers and specials; note multiplayer changes"`
