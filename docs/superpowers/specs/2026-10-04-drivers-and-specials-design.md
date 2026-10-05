# Drivers and special powers

Date: 2026-10-04. Status: design approved in chat, awaiting spec review. Part of milestone 5 (garage and
characters). Independent of the multiplayer build: it works in single-player first and carries into rooms with
small additions (see Multiplayer interaction).

## Goal

Players pick a **driver** as well as a vehicle, in the style of Beach Buggy Racing. Each driver has one
**special power**, fired from a charge meter with its own button, and the driver is visible in the vehicle.
Success looks like:

- the Garage lets you pick Moshood or Mama Put, and the preview shows that driver in the chosen vehicle;
- in a race the special meter fills, a Special button fires it, and the two specials feel clearly different
  from each other and from fuel, crude oil, juju and odeshi;
- AI racers use drivers and specials too, so the grid looks and plays like the picker promised;
- vehicles still draw in a few dozen calls on a budget phone (no draw-call regression from adding drivers).

## Decisions (agreed)

| Topic | Decision |
|---|---|
| Driver vs vehicle | Chosen separately. Any driver can ride any vehicle. |
| Special power use | Charge meter plus a dedicated Special button. The item button is unchanged. |
| Drivers in v1 | **Moshood** (agbero, Push Squad) and **Mama Put** (food seller, Pepper Soup Trail). |
| On the vehicle | The driver is visible in the vehicle, built into the vehicle models (not a separate object). |
| Default driver | Moshood. |
| AI | Each AI racer gets a random driver and fires its special by rule. |
| Existing generic riders | Replaced in the driver's seat. Passengers and conductors stay. |

## Drivers

Both are parody characters (no real people). Look and attitude come from the approved concept page
`reference/characters-showroom.html`.

| | Moshood | Mama Put |
|---|---|---|
| Role | Agbero | Food seller |
| Look | Wiry, faded yellow singlet, short trousers, flip-flops, towel on one shoulder, mustache, furious | Wide and strong, red-and-gold ankara dress and head tie, gold earrings, stern scowl |
| Special | **Push Squad** | **Pepper Soup Trail** |
| Charge time | 30 s | 30 s |

### Push Squad

His boys run behind the vehicle and shove for **4 s**. A steady boost, different from fuel's short burst:

- top speed ×1.35 and acceleration ×2.6 while it lasts (fuel: ×1.3 and ×2.2 for 2.6 s, plus a forward impulse);
- three small boys run behind the vehicle (visual only), with a "Oya push!" sound cue;
- stacks with fuel (the two timers are independent). Multiplayer referee allowance is unaffected (see below).

### Pepper Soup Trail

Mama Put drops steaming soup behind her for **5 s**:

- a soup patch every **3.5 m travelled** while the trail is active (about 40 at top speed), each lasting
  **9 s** with radius **2.0 m**. Distance-based, so the trail stays continuous at any speed. Capped at 40
  patches per use;
- a racer driving through a patch gets **cough** for **2.4 s** (scaled by the existing `lasting()` rule, so
  tough vehicles shrug it off sooner): top speed ×0.7 and acceleration ×0.7, a steering swerve like the oil
  slip's, and on the player's screen a light blur and orange-red vignette. After a cough ends the racer is
  immune for 1 s, like oil, so they can drive out;
- **odeshi** blocks it, and Mama Put and her own trail never affect each other;
- visual: red-brown patches with a few steam puffs rising from the newest ones.

Both special effects use fields that already exist in the runtime pattern (timers on the racer, hazards in the
race), so they reuse the existing hit rules, sounds and flash messages.

## The special meter

- Each racer has `charge` from 0 to 1. It fills at `1 / chargeTime` per second **only while the race is on**
  (not during the countdown, not after the racer has finished). It does not exceed 1.
- At 1 the special is **ready**. Pressing the Special button fires it, resets `charge` to 0 and sets the
  effect timer. Pressing before it is ready does nothing (a small "not ready" sound).
- Charge starts at 0 at the green light, for every racer.
- Using a special does not use up or interfere with a held item.

## Controls and HUD

- `Controls` gains `special: boolean` (a one-frame flag like `useItem`).
- Keyboard: **Q** (the existing item keys stay: Space, E, Shift, F).
- Touch: a round **Special** button in the HUD directly beside the power-up button (which now lives in
  `Hud.tsx`), with a conic-gradient charge ring around it. It shows the driver's initial and glows when ready.
  Same size as the power-up button, so thumbs reach both.
- `Hud` gains `special: { name: string; charge: number; ready: boolean }`, refreshed with the existing
  throttled HUD updates (about 10 Hz is enough for the ring).
- Keyboard players see a small meter bar near the item slot with "Q" on it.

## Runtime changes

| File | Change |
|---|---|
| `src/config/drivers.ts` (new) | `DriverId`, `DriverConfig` (id, name, role, blurb, special kind, chargeTime), `DRIVERS`, `driverById`, `DEFAULT_DRIVER`. The single place to tune charge times. |
| `src/game/runtime.ts` | `Racer` gains `driver: DriverId`, `charge`, `push`, `cough`, `trail` (seconds of trail left), `trailDist`. `Hazard.kind` gains `'soup'`. `Puff` gains a colour for steam. `makeRacer` takes the driver. |
| `src/game/specials.ts` (new) | `updateSpecials(race, dt, flash)`: charge, firing, push timer, trail drop, soup hits and cough. Called next to `updateItems`. Pure race-state logic, unit-tested like `items.ts`. |
| `src/game/items.ts` | Two small changes. The hazard loop's `else` branch currently treats every non-juju hazard as crude oil, so it becomes `kind === 'oil'` (otherwise a soup patch would act like oil). The shared hazard life countdown and cleanup already cover soup patches. `push`, `cough` and `trail` count down in `updateSpecials`, not here. |
| `src/scene/Vehicle.tsx` | Push multiplies top speed and acceleration, cough multiplies them down and adds the swerve. Reads `racer.driver` for the model. |
| `src/game/ai.ts` | Special use rule (below). |
| `src/game/input.ts` | `special` control, Q key, `touch.special`. |
| `src/ui/Hud.tsx`, `src/ui/ScreenFx.tsx`, `src/game/fx.ts`, `src/scene/FxBridge.tsx`, `src/styles.css` | Special button with ring and keyboard cue in the HUD; the cough screen effect goes through the existing `fx` bridge (`fx.cough`), like the oily edges. |
| `src/scene/Effects.tsx`, `src/scene/art/items.ts` | Soup patches, steam puffs, the three pushing boys. |
| `src/game/audio.ts` | New cues: `push`, `soup`, `cough`, `notReady`. |
| `src/game/store.ts` | `driver: DriverId` in the save (default Moshood; unknown ids fall back to the default), `setDriver`. |
| `src/scene/RaceScene.tsx` | `makeRace` gives the player the saved driver and each AI a random one. |

### AI use rules

- Moshood: fires when the racer is on a straight (low upcoming curvature) and the meter is ready, after a
  short random delay (0.5 to 2 s), so it looks like a decision.
- Mama Put: fires when another racer is within 30 m **behind** her on the road and the meter is ready (the
  trail is dropped behind her), after the same short delay. If nobody is close, she waits for up to 10 s and
  then fires anyway.
- AI cars do not stand still waiting: the delay logic follows the existing `itemDelay` pattern.

## Driver models

The vehicle models are built in code (`reference/sporty/`) and compiled to `src/models/generated/showroom.js`
by `node scripts/sync-models.mjs`. Drivers go in the same pipeline so the merge step still runs and draw calls
stay low.

- `reference/sporty/core.js` gains `DRIVER_LOOKS` and `driverFigure(driverId, seat)`. `driverFigure` calls
  `person()` with the character's look merged with the seat's pose options (hands, ankle, lean), which the
  vehicle supplies, so the hands still reach the bars and wheel.
- `person()` gains the options already prototyped on the concept page: `shorts`, `shoe`, `mustache`, and
  `angry` (0 friendly, 1 scowl, 2 shouting: slanted brows, heavy lids, small pupils, frown). It also exposes
  its head group.
- Body build is a per-driver scale (Moshood thin and a bit tall, Mama Put wide), capped on seated figures so
  they still fit the seat.
- Props (bottle, ladle, towel, apron) show only in the concept page. On vehicles, hands are on the bars, so
  the characters read from clothes, build and face.
- Each builder takes a driver id: `buildOkada(body, driver)`, `buildKeke(driver)`, `buildDanfo(driver)`,
  `buildBRT(lowerColor, number, driver)`.

| Vehicle | What the driver replaces |
|---|---|
| Okada | The rider (full figure, leaned forward on the bike; no helmet or union vest). The side-saddle passenger stays. |
| Keke | The driver (the first `kekeRider`). Passengers stay. |
| Danfo | The driver's **head at the window** (the driver is only a head there). The conductor stays. |
| BRT | The BRT has no visible driver, so the character takes the **conductor's place** at the front door, still waving. |

- `buildVehicleModel(id, scale, { driver })` in `src/models/index.ts` passes the driver through.
  `Vehicle.tsx` and `Preview.tsx` key their memo on the driver as well as the vehicle.
- The generated file is regenerated, never edited by hand.

## Driver picker and save

- **Garage:** a "Driver" row under the vehicle tabs, two cards (name, role, special name, one-line
  description, charge time). Selecting a driver updates the 3D preview immediately and saves. The vehicle
  stats card is unchanged.
- **Save:** `driver` joins the existing save object. Old saves load with Moshood. Loaded ids are checked
  against `DRIVERS`.
- **Menu:** shows the selected vehicle and driver names together.

## Multiplayer interaction

- Specials travel as ordinary `use` events: `kind` `'push'` or `'soup'`. Push only sets a flag. For soup,
  each phone spawns patches along that car's own track (the owner's real pose on the owner's phone, the
  interpolated pose on others), so no per-patch messages are sent. Victims send `hit` events like oil.
- Snapshot flags (a `u8`) gain `push` and `cough` bits, which exactly fills the byte (boost, slip, curse,
  wobble, horn, finished, push, cough).
- The lobby start message carries each car's driver id, so every phone builds the same model.
- Referee: push (×1.35) stacks with fuel (×1.3) to ×1.76, which is over the ×1.6 too-fast-lap allowance on
  the vehicle's maxed-out top speed. When the referee is built, raise the allowance to ×1.8.
- **Changes to the multiplayer spec and plan** (do when that milestone is built): add the two use kinds, the
  two flag bits, and the driver id in the start message.

## Edge cases

- Respawn (stuck car put back on the road): charge and push stay, an active trail stops and its remaining
  time is dropped.
- Finishing the race: charge stops, an active push or trail ends.
- Pause: nothing advances, as with all timers.
- Rematch or restart: everyone's charge is 0.
- Two racers with the same driver: allowed (both Moshood on the grid is fine).
- The player's coin and unlock rules are untouched. Drivers are free in v1.

## Out of scope

- More drivers, unlockable drivers, driver upgrades or costumes.
- Driver voice lines and speech bubbles (a nice later pass).
- Separate standing character portrait in the Garage (the preview is the vehicle with its driver).
- Driver choice in the multiplayer lobby UI (the protocol hooks are listed above; the lobby arrives with that
  milestone).
- Server validation (arrives with accounts).

## Testing

- **Unit tests (Vitest, alongside `items.test.ts`):**
  - charge fills only while racing, at the configured rate, and caps at 1; zero during countdown and after
    finishing;
  - firing: requires charge 1, resets it, ignores presses while not ready;
  - Push Squad: sets the push timer, expires after 4 s, stacks with `boost`;
  - Pepper Soup Trail: patches spawn by distance (about every 3.5 m), stop after 5 s, stay under the cap;
  - cough: set by a patch, scaled by toughness, immunity afterwards, blocked by odeshi, never hits the owner;
  - AI rules: Moshood fires on a straight, Mama Put fires with a rival behind and after the timeout otherwise;
  - `drivers.ts`: every driver has a special kind and a charge time above zero;
  - save load: unknown driver id falls back to the default.
- **Model check:** run `node scripts/sync-models.mjs` and confirm all four builders return a figure for each
  driver (a small headless script, like the existing play-test approach). Compare the draw-call count for a
  vehicle with and without a driver; it must not grow by more than a handful.
- **Manual, at a phone viewport:** the Garage driver row, the preview, the Special button and ring under a
  thumb next to the item button, firing both specials, the cough blur, and a full race with AI drivers.

## Build order

Each step ends with something playable.

1. **Gameplay with placeholder looks.** `drivers.ts`, runtime fields, `specials.ts` and its tests, input,
   Special button and HUD ring, AI rules, store and a plain driver picker (no preview change), effects and
   sounds. Vehicles still show their old riders.
2. **Characters on the vehicles.** `driverFigure`, builder changes, regenerate models, `buildVehicleModel`
   driver option, wire `Vehicle.tsx` and `Preview.tsx`, picker preview and cards.
3. **Docs.** Update `2026-10-03-multiplayer-design.md` and its plan (use kinds, flag bits, driver id), the
   `CLAUDE.md` vehicle and power-up notes, and `README.md`.

## Prerequisite

The source tree is clean on `main` (the earlier uncommitted gameplay changes have been committed, and the
vehicle paints work has landed), so the plan can start directly. The vehicle upgrades plan edits some of the same
files (`store.ts`, `save.ts`, `Garage.tsx`, `RaceLogic.tsx`, `Vehicle.tsx`); build on a branch or worktree, and
whichever lands second merges small edits.
