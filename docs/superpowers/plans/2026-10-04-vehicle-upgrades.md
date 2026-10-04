# Vehicle Upgrades and Naira Payouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Top-3 finishers earn naira, and players spend it in the Garage on per-vehicle Engine, Tyres and Body upgrades that change how that vehicle drives.

**Architecture:** Pure config and logic modules (`src/config/economy.ts`, `src/game/upgrades.ts`) hold every number and the `applyUpgrades(base, levels)` function, which returns an ordinary `VehicleConfig`. The player's racer is built from that effective config, so physics, camera, sound and HUD need no changes; AI keeps base configs. The zustand store gains saved `upgrades` and a `buyUpgrade` action, and the Garage and Results screens show them.

**Tech Stack:** Vite, React, TypeScript, zustand, React Three Fiber and Rapier, Vitest (`npm test` runs `vitest run`).

**Spec:** `docs/superpowers/specs/2026-10-04-vehicle-upgrades-design.md`

## Global Constraints

- Payouts: 1st ₦200,000, 2nd ₦150,000, 3rd ₦100,000, 4th to 6th ₦0. They replace the 150/100/60/30/20 table.
- Upgrade prices for level 1 to 5, same for every vehicle and category: ₦80,000, 120,000, 160,000, 200,000, 260,000. `MAX_UPGRADE_LEVEL = 5`.
- Unlock prices: Blue BRT ₦2,000,000, Red BRT ₦3,000,000.
- Per-level steps: Engine `topSpeed` +4%, `accel` +6%. Tyres `grip` +4%, `steerAtSpeed` +3% (capped at 1), `brake` +4%. Body `impact` −10%, `mass` +3%.
- Stat bars: each upgrade level adds 0.4 to its stat's bar (Engine→Speed, Tyres→Handling, Body→Toughness), capped at 10.
- Naira replaces coins: keep the save field name `coins` and the key `lagos-racer:v1`. Old saves must still load; a missing `upgrades` entry means level 0.
- AI cars always use base stats. Nothing about upgrades is synced in multiplayer.
- Style: match the existing code (compact, comments only where the reason is not obvious). Test files sit next to the code, like `src/game/race.test.ts`.
- **Working tree caveat:** the repo has uncommitted changes by the user in `src/scene/Vehicle.tsx`, `src/ui/Menu.tsx`, `src/styles.css`, `src/game/runtime.ts` and others. When committing a task that touches these files, stage only this feature's hunks (`git add -p`); never commit the user's unrelated edits.

## Review Focus

- Tampered or corrupt saved levels (negative, above 5, fractional, NaN, strings, unknown vehicle ids, non-objects) must not crash or grant levels: pinned in Task 2 (`sanitizeUpgrades` tests).
- Double-tapping Buy with money for only one purchase must buy once: pinned in Task 4.
- Buying for a locked vehicle, or past level 5, must do nothing and keep the balance: pinned in Task 4.
- Place values outside 0 to 5 (a missing player at −1, NaN, more than six racers) must pay ₦0, not `undefined` or `NaN`: pinned in Task 1.
- Amounts near the ₦1M boundary and zero must format cleanly (₦999,999, ₦1M, ₦0): pinned in Task 1.

---

### Task 1: Economy config

**Files:**
- Create: `src/config/economy.ts`, `src/config/economy.test.ts`
- Modify: `src/config/vehicles.ts` (`locked.coins` on `brt-blue` and `brt-red`)

**Interfaces:**
- Produces (all exported from `src/config/economy.ts`):
  - `PAYOUTS: number[]` = `[200_000, 150_000, 100_000]`
  - `UPGRADE_PRICES: number[]` = the five prices above
  - `MAX_UPGRADE_LEVEL: 5`
  - `UPGRADE_STEPS` = `{ engine: { topSpeed: 0.04, accel: 0.06 }, tyres: { grip: 0.04, steerAtSpeed: 0.03, brake: 0.04 }, body: { impact: -0.1, mass: 0.03 } }` (per-level fractions)
  - `STAT_BAR_STEP = 0.4`
  - `payoutForPlace(place: number): number`: 0-based place; anything outside the table (negative, NaN, 3 and up) gives 0.
  - `upgradePrice(level: number): number | null`: price of buying the level after `level` (0 to 4); `null` at max or for invalid input.
  - `formatNaira(n: number): string`

- [ ] **Step 1: Write the failing tests** in `src/config/economy.test.ts`
  - `payoutForPlace` maps 0, 1, 2, 3, 4, 5 to 200000, 150000, 100000, 0, 0, 0.
  - `payoutForPlace(-1)`, `payoutForPlace(6)`, `payoutForPlace(NaN)` are all 0.
  - `upgradePrice(0..4)` equals the five prices; `upgradePrice(5)` and `upgradePrice(-1)` are `null`.
  - The five prices sum to 820_000; three categories sum to 2_460_000.
  - `formatNaira`: 0 → `₦0`, 200000 → `₦200,000`, 999999 → `₦999,999`, 1_000_000 → `₦1M`, 1_250_000 → `₦1.3M`, 3_000_000 → `₦3M`; NaN and negatives → `₦0`.
  - `vehicleById('brt-blue').locked?.coins` is 2_000_000 and `'brt-red'` is 3_000_000.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/config/economy.test.ts`
Expected: FAIL (module `./economy` not found).

- [ ] **Step 3: Implement `src/config/economy.ts`** with the exports above. `formatNaira` uses `toLocaleString('en-US')` below one million (fixed locale so output does not vary by device) and one decimal with a trailing `.0` removed from one million up. Change the two unlock prices in `src/config/vehicles.ts`.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/config/economy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config/economy.ts src/config/economy.test.ts src/config/vehicles.ts
git commit -m "Add naira economy config and rescale vehicle unlock prices"
```

(`vehicles.ts` is only partly this task's if the user has edited it; check `git diff` first and use `git add -p`.)

---

### Task 2: Upgrade logic and the `impact` tuning field

**Files:**
- Modify: `src/config/vehicles.ts`: add `impact: number` to the `tuning` type and `impact: 1` to all six vehicles' tuning, with a doc comment (scales speed lost to knocks and wall scraping).
- Create: `src/game/upgrades.ts`, `src/game/upgrades.test.ts`

**Interfaces:**
- Consumes: Task 1's `UPGRADE_STEPS`, `MAX_UPGRADE_LEVEL`, `STAT_BAR_STEP`.
- Produces (from `src/game/upgrades.ts`):
  - `type UpgradeKind = 'engine' | 'tyres' | 'body'`; `UPGRADE_KINDS: UpgradeKind[]` in that order
  - `type UpgradeLevels = Record<UpgradeKind, number>`; `NO_UPGRADES: UpgradeLevels` (all 0)
  - `type UpgradeMap = Partial<Record<VehicleId, UpgradeLevels>>`
  - `levelsFor(map: UpgradeMap, id: VehicleId): UpgradeLevels` (falls back to `NO_UPGRADES`)
  - `applyUpgrades(base: VehicleConfig, levels: UpgradeLevels): VehicleConfig`: returns a new config, never mutates `base`; only `tuning` changes.
  - `displayStats(base: VehicleConfig, levels: UpgradeLevels): Record<'speed' | 'handling' | 'toughness', { base: number; bonus: number }>`: `bonus = min(10 − base, STAT_BAR_STEP × level)`.
  - `sanitizeUpgrades(raw: unknown): UpgradeMap`: keeps only known vehicle ids whose value is an object; each category that is an integer is clamped to 0..5, anything else becomes 0; non-object input returns `{}`.
  - `UPGRADE_INFO: Record<UpgradeKind, { label: string; blurb: string }>` with labels `Engine`, `Tyres`, `Body` and one-line blurbs (for the Garage).

- [ ] **Step 1: Write the failing tests** in `src/game/upgrades.test.ts`
  - `applyUpgrades(okada, NO_UPGRADES)` deep-equals the base config.
  - Engine 5 on the okada: `topSpeed` ≈ 33 × 1.2, `accel` ≈ 9.5 × 1.3; grip, mass and impact unchanged.
  - Tyres 5: `grip` ≈ 9 × 1.2, `brake` ≈ 9 × 1.2, `steerAtSpeed` ≈ 0.38 × 1.15. With a copy of a config whose `steerAtSpeed` is 0.95, tyres 5 gives exactly 1.
  - Body 5: `impact` ≈ 0.5, `mass` ≈ 260 × 1.15.
  - Level 2 engine gives ×1.08 top speed (steps are linear per level).
  - `applyUpgrades` leaves the input unchanged (`JSON.stringify` before equals after) and returns a different object.
  - `displayStats`: okada with engine 5 gives speed `{ base: 9, bonus: 1 }`; keke with tyres 3 gives handling bonus ≈ 1.2; blue BRT with body 5 gives toughness bonus 0.
  - `levelsFor({}, 'okada')` equals `NO_UPGRADES`.
  - `sanitizeUpgrades({ okada: { engine: 3, tyres: 9, body: -2 }, keke: { engine: 2.5, tyres: '4', body: NaN }, ghost: { engine: 5 }, danfo: 'x' })` returns `{ okada: { engine: 3, tyres: 5, body: 0 }, keke: { engine: 0, tyres: 0, body: 0 } }`.
  - `sanitizeUpgrades(null)`, `(undefined)`, `([])` and `('x')` all return `{}`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/game/upgrades.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `impact` in `vehicles.ts` and `src/game/upgrades.ts`. Multiplier form: `base × (1 + step × level)` for each boosted field, `impact × (1 + step × level)` with the negative step, `steerAtSpeed` through `Math.min(1, …)`. Treat levels passed in as already valid (sanitising happens at load).

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests pass, no type errors (adding `impact` to the type must be satisfied by all six vehicles).

- [ ] **Step 5: Commit**

```bash
git add src/game/upgrades.ts src/game/upgrades.test.ts src/config/vehicles.ts
git commit -m "Add upgrade levels, applyUpgrades and save sanitising"
```

---

### Task 3: Make Body matter in physics

**Files:**
- Modify: `src/scene/Vehicle.tsx` (the knock and scrape lines near 146 and 153)

**Interfaces:**
- Consumes: `racer.vehicle.tuning.impact` from Task 2.

- [ ] **Step 1: Apply `impact` to both penalties.** The knock becomes `racer.knock * t.impact` where it is applied to `nx`/`nz`; the scrape drag becomes `Math.pow(0.55, dt * t.impact)`. With `impact = 1` the behaviour must be exactly as today. `t` is already `racer.vehicle.tuning` in this scope; confirm the variable name in context. Do not change how `racer.knock` is set in the collision handler.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors, tests still pass. (The in-game effect is checked in Task 6, once levels can be bought.)

- [ ] **Step 3: Commit** (stage only these hunks; the file has unrelated user edits)

```bash
git add -p src/scene/Vehicle.tsx
git commit -m "Scale knock and scrape penalties by the vehicle's impact tuning"
```

---

### Task 4: Store: saved upgrades and buying

**Files:**
- Modify: `src/game/store.ts`
- Create: `src/game/store.test.ts`

**Interfaces:**
- Consumes: `upgradePrice`, `MAX_UPGRADE_LEVEL` (Task 1); `UpgradeKind`, `UpgradeMap`, `levelsFor`, `sanitizeUpgrades` (Task 2).
- Produces: `State.upgrades: UpgradeMap`; `State.buyUpgrade: (vehicle: VehicleId, kind: UpgradeKind) => boolean` (true only if a purchase happened).

- [ ] **Step 1: Write the failing tests** in `src/game/store.test.ts`. The store imports fine in Node (`localStorage` access is already inside try/catch). Reset between tests with `useGame.setState({ coins, unlocked: [], upgrades: {} })`.
  - With ₦100,000, `buyUpgrade('okada', 'engine')` returns true, leaves ₦20,000, and sets `upgrades.okada.engine` to 1.
  - With ₦79,999 it returns false and changes nothing.
  - Level 5 engine: returns false, coins and level unchanged.
  - Locked `brt-blue` (not in `unlocked`) with ₦10,000,000: returns false, nothing changes. After `unlocked: ['brt-blue']` the same call succeeds.
  - Double buy: with ₦100,000, two calls in a row return `true` then `false`; level is 1 and coins ₦20,000.
  - Upgrading `okada` engine does not change `okada-blue` levels.
  - `unlock('brt-blue')` with ₦1,999,999 does nothing; with ₦2,000,000 it leaves ₦0 and marks it unlocked.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/game/store.test.ts`
Expected: FAIL (`buyUpgrade` is not a function).

- [ ] **Step 3: Implement.** Add `upgrades: UpgradeMap` to `Saved` and to the saved data in `save()`; `load()` runs `sanitizeUpgrades(s.upgrades)` and defaults to `{}`. `buyUpgrade` reads the current state with `get()` at call time (so a second tap sees the first's result), checks: vehicle is not locked (`!v.locked || unlocked.includes`), level below max, `coins >= price`; then sets coins and the new levels immutably and calls `save()`.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/store.ts src/game/store.test.ts
git commit -m "Save upgrade levels and add buyUpgrade"
```

---

### Task 5: Race wiring: upgraded player, naira payout

**Files:**
- Modify: `src/scene/RaceScene.tsx` (`makeRace` and its call site), `src/scene/RaceLogic.tsx:134`

**Interfaces:**
- Consumes: `applyUpgrades`, `levelsFor`, `NO_UPGRADES` (Task 2), `payoutForPlace` (Task 1), `useGame().upgrades` (Task 4).
- Produces: `makeRace(trackId: string, playerVehicle: VehicleId, upgrades: UpgradeLevels = NO_UPGRADES)`.

- [ ] **Step 1: Wire it.** In `makeRace`, the player racer's vehicle is `applyUpgrades(vehicleById(vid), upgrades)`; AI racers keep `vehicleById(vid)`. Find the call site with `grep -n "makeRace(" src -r` and pass `levelsFor(useGame.getState().upgrades, vehicle)` there (read the state at race start, not on every render). In `RaceLogic.tsx` replace the coin table with `const coins = payoutForPlace(place);`.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors, tests pass.

- [ ] **Step 3: Commit** (stage only these hunks)

```bash
git add -p src/scene/RaceScene.tsx src/scene/RaceLogic.tsx
git commit -m "Race the upgraded vehicle and pay naira by finishing place"
```

---

### Task 6: Garage, Results and Menu UI

**Files:**
- Modify: `src/ui/Garage.tsx`, `src/ui/Results.tsx`, `src/ui/Menu.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: `formatNaira`, `upgradePrice`, `MAX_UPGRADE_LEVEL` (Task 1); `UPGRADE_KINDS`, `UPGRADE_INFO`, `levelsFor`, `displayStats` (Task 2); `buyUpgrade`, `upgrades`, `coins` from `useGame` (Task 4).

- [ ] **Step 1: Garage.** Change `Bar` to take `base` and `bonus`: the bar is a flex row with the existing yellow `<i>` at `base × 10%` followed by a second `<i className="up">` (green, `var(--green)`) at `bonus × 10%`; the `aria-label` reads the total. Stats come from `displayStats(v, levelsFor(upgrades, v.id))`. For an unlocked vehicle, render under the bars one row per `UPGRADE_KINDS` entry: label, five level pips (filled up to the current level), and a button: `formatNaira(price)` when buyable, disabled with the same text if `coins` is short, or the text `MAX` at level 5. Buttons keep the 46px minimum height of `.btn`. For a locked vehicle show "Unlock to upgrade" instead of the rows. Replace `₦ {coins}` and the unlock labels with `formatNaira`.
- [ ] **Step 2: Results.** The earned line becomes `+ {formatNaira(coinsEarned)}`; when `coinsEarned` is 0 it reads "No naira this time. Finish top 3 to earn".
- [ ] **Step 3: Menu.** The balance uses `formatNaira` (keep the `aria-label`).
- [ ] **Step 4: CSS.** Add styles for `.bar i.up`, the upgrade rows and pips, matching the existing look (ink borders, yellow and green). Check there is no horizontal overflow at 375px wide.
- [ ] **Step 5: Verify automatically**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Verify in the browser** (`preview_start` with the dev server from `.claude/launch.json`, mobile viewport 375×812). Before loading, set `localStorage['lagos-racer:v1']` to a save with `coins: 5000000`. Check:
  - the Garage shows ₦5M, three upgrade rows, and buying Engine level 1 deducts ₦80,000 and extends the Speed bar in green;
  - a locked BRT shows "Unlock to upgrade" and its ₦2M / ₦3M prices;
  - with Okada Engine at 5, the HUD speed on a straight reaches about 142 km/h (33 m/s × 3.6 × 1.2), against about 119 km/h at level 0;
  - with Body at 5, running into a wall costs visibly less speed;
  - finishing 1st shows `+ ₦200,000`; finishing 4th or lower shows the "No naira" line.
  Take a screenshot of the Garage and of the Results screen.

- [ ] **Step 7: Commit** (stage only this feature's hunks in `Menu.tsx` and `styles.css`)

```bash
git add src/ui/Garage.tsx src/ui/Results.tsx
git add -p src/ui/Menu.tsx src/styles.css
git commit -m "Garage upgrade rows, naira formatting, payout copy on results"
```

---

### Task 7: Update the multiplayer docs

**Files:**
- Modify: `docs/superpowers/specs/2026-10-03-multiplayer-design.md` (the referee's lap-time bullet near line 194 and the "Coins are awarded by place" line near 200), `docs/superpowers/plans/2026-10-03-multiplayer.md` (lines near 53, 675 and 699 that use `topSpeed`)

- [ ] **Step 1: Edit the docs.** Wherever the referee uses a vehicle's `topSpeed × 1.6`, it must use `applyUpgrades(base, { engine: 5, tyres: 5, body: 5 }).tuning.topSpeed` instead (the maxed top speed), with a one-line reason: upgraded players are faster than base. Change the coins line to say rooms pay naira with `payoutForPlace`, see `2026-10-04-vehicle-upgrades-design.md`. The multiplayer test name at plan line 699 should still match its behaviour.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-10-03-multiplayer-design.md docs/superpowers/plans/2026-10-03-multiplayer.md
git commit -m "Multiplayer docs: referee uses maxed top speed, rooms pay naira"
```

---

## Self-review notes

- **Spec coverage:** economy and unlock prices (Task 1); upgrade effects, stat bars, `impact`, save sanitising (Task 2); Body in physics (Task 3); data flow and `buyUpgrade` (Task 4); player from `applyUpgrades`, AI unchanged, payout wiring (Task 5); Garage, Results and Menu, edge cases for no money, max level and ₦0 payout (Task 6); multiplayer referee and results notes (Task 7). Out-of-scope items are not planned.
- **Type consistency:** `UpgradeKind`, `UpgradeLevels`, `UpgradeMap`, `levelsFor`, `applyUpgrades`, `displayStats`, `sanitizeUpgrades`, `buyUpgrade`, `payoutForPlace`, `upgradePrice` and `formatNaira` are defined once (Tasks 1 and 2) and used with those names later.
