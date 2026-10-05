# Premium currency, paid skins and the BRT unlock: Implementation Plan (step 1, no payments)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yellow default paints, every other paint bought with premium currency, and the BRT unlocked by rewarded ad(s) or premium currency, all working offline with no real payments.

**Architecture:** Premium balance, owned paints and BRT ad progress live in the existing localStorage save (`src/game/save.ts`) and the zustand store (`src/game/store.ts`). Prices and the BRT rule live in config. The ad provider is a swappable stub. Real purchases and a real ad network come in later steps (spec build order 2 to 4).

**Tech Stack:** TypeScript, React, zustand, vitest. Tests: `npm test` (vitest run). Typecheck: `npm run typecheck`.

**Spec:** `docs/superpowers/specs/2026-10-05-premium-currency-design.md`

## Global Constraints

- Default paint is yellow on Okada, Keke and Danfo; the BRT keeps its white-and-blue (first paint, Blue). The default paint (index 0) is always free and owned.
- Every other paint costs premium currency. Skins are cosmetic only: no stat changes anywhere.
- Premium currency buys only skins and the BRT unlock. Naira is untouched and never sold.
- The BRT unlocks by `locked.ads` rewarded ad view(s) or `locked.premium` premium currency. The naira price (`locked.coins`) goes away.
- No loot boxes or random drops. Prices are shown before buying.
- Currency name, skin price, BRT price and ad count are undecided. Keep them as clearly marked placeholders in config only: label `'Premium'`, `PAINT_PRICE = 100`, BRT `{ premium: 500, ads: 1 }`.
- Do not touch the uncommitted files already modified in the working tree (drivers, fx, models, `Vehicle.tsx` and others). Stage only the files each task lists.
- Test on a mobile viewport as well as desktop (project rule).

## Review Focus

- A player whose existing save already has a non-default paint chosen keeps that paint (grandfathered as owned), not silently reset. (Task 2)
- A save that names a paint as chosen but does not own it (hand-edited or corrupted) falls back to the vehicle's default. (Task 2)
- Buying a paint twice, or with too little premium, does not charge twice or go negative; a premium balance that is negative, NaN or a string in the save loads as 0. (Tasks 2, 3)
- An ad that is dismissed or fails does not count toward the BRT; an ad view for a vehicle that is not locked, or already unlocked, changes nothing. (Tasks 3, 4)
- A player who already unlocked the BRT with naira stays unlocked, and the room lobby still lists only unlocked vehicles. (Tasks 2, 5)

## Known limit (state in the final summary)

Ownership is client-side (localStorage) in this step, so a player can edit their save. That is acceptable until the server wallet (spec step 3). Rooms do not verify paint ownership either. Until a real ad provider or payments exist, the BRT cannot be unlocked in a production build except with the dev shortcuts below, so do not deploy this step on its own.

---

### Task 1: Config: yellow defaults, paint prices, new BRT lock rule

**Files:**
- Create: `src/config/premium.ts`, `src/config/vehicles.test.ts`
- Modify: `src/config/vehicles.ts` (Okada paints line 55, `locked` type line 19 and BRT line 103, new helpers near `paintOf` line 119)
- Commit also: `docs/superpowers/specs/2026-10-05-premium-currency-design.md`

**Interfaces:**
- Produces, `src/config/premium.ts`: `PREMIUM_LABEL: string` (`'Premium'`), `PAINT_PRICE: number` (`100`).
- Produces, `src/config/vehicles.ts`:
  - `VehicleConfig.locked?: { premium: number; ads: number }`
  - `paintKey(vehicle: VehicleId, paintId: string): string` returns `` `${vehicle}/${paintId}` ``
  - `paintPrice(v: VehicleConfig, paintId: string): number` returns 0 for `v.paints[0]`, else `PAINT_PRICE`
  - `ownsPaint(owned: string[], v: VehicleConfig, paintId: string): boolean` true for the default paint or when `paintKey` is in `owned`

- [ ] **Step 1: Write `src/config/vehicles.test.ts`** with these tests:
  - `it('every vehicle but the BRT starts yellow')`: `paints[0].name === 'Yellow'` for okada, keke, danfo; `vehicleById('brt').paints[0].name === 'Blue'`.
  - `it('keeps six paints each, all with distinct ids')`.
  - `it('the default paint is free and owned, others cost PAINT_PRICE')`: `paintPrice(okada, okada.paints[0].id) === 0`, `paintPrice(okada, 'red') === PAINT_PRICE`; `ownsPaint([], okada, okada.paints[0].id)` true; `ownsPaint([], okada, 'red')` false; `ownsPaint([paintKey('okada','red')], okada, 'red')` true.
  - `it('the BRT unlocks by ads or premium, not naira')`: `vehicleById('brt').locked` equals `{ premium: 500, ads: 1 }`; other vehicles have no `locked`.
- [ ] **Step 2: Run** `npx vitest run src/config/vehicles.test.ts`. Expected: FAIL (helpers missing, Okada starts Red).
- [ ] **Step 3: Implement.** Okada paints become Yellow `#ffb000` first, then Red, Blue, Black, Green, Purple (Yellow replaces Orange to keep six). Change the `locked` type and the BRT entry. Add the three helpers beside `paintOf`. Create `premium.ts` with the two constants and a comment that all four values are placeholders.
- [ ] **Step 4: Run** `npx vitest run src/config/vehicles.test.ts`. Expected: PASS. Then `npm run typecheck`; expected errors only in `store.ts` and `Garage.tsx` (they still use `locked.coins`), which Tasks 3 and 5 fix.
- [ ] **Step 5: Commit**

```bash
git add src/config/premium.ts src/config/vehicles.ts src/config/vehicles.test.ts docs/superpowers/specs/2026-10-05-premium-currency-design.md
git commit -m "Premium currency config: yellow defaults, paint prices, BRT ad-or-premium lock"
```

### Task 2: Save data: premium balance, owned paints, ad progress

**Files:**
- Modify: `src/game/save.ts` (`Saved` type, `defaultSave`, `normaliseSave`)
- Test: `src/game/save.test.ts`

**Interfaces:**
- Consumes: `paintKey`, `ownsPaint`, `vehicleById` from `src/config/vehicles.ts`.
- Produces: `Saved` gains `premium: number` (integer, 0 minimum), `ownedPaints: string[]` (`paintKey` strings), `adViews: Partial<Record<VehicleId, number>>` (integer, 0 to that vehicle's `locked.ads`). Defaults: `0`, `[]`, `{}`.

- [ ] **Step 1: Add tests** to `save.test.ts`:
  - `it('defaults to no premium, no bought paints and no ad views')`.
  - `it('grandfathers a non-default paint chosen in an older save')`: `normaliseSave({ paint: { okada: 'red' } })` gives `ownedPaints` containing `'okada/red'` and keeps `paint.okada === 'red'`.
  - `it('drops a chosen paint that is not owned when ownedPaints exists')`: `normaliseSave({ ownedPaints: [], paint: { okada: 'red' } }).paint.okada` is `undefined`.
  - `it('ignores unknown vehicles and paints in ownedPaints')`: junk keys such as `'helicopter/red'`, `'okada/pink'`, `42` are removed.
  - `it('loads a bad premium balance as 0')`: for `-5`, `NaN`, `'9'`, `1.7` expect `0, 0, 0, 1`.
  - `it('clamps ad views to the vehicle rule and ignores other vehicles')`: `{ brt: 9, okada: 3 }` becomes `{ brt: 1 }`.
  - `it('keeps a BRT already unlocked with naira')`: `normaliseSave({ unlocked: ['brt'] }).unlocked` equals `['brt']`.
- [ ] **Step 2: Run** `npx vitest run src/game/save.test.ts`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** the three fields in `Saved`, `defaultSave` and `normaliseSave`. Grandfathering rule: when `raw.ownedPaints` is not an array, own every paint named in `raw.paint` that exists on its vehicle; when it is an array, keep only valid keys. Then remove any `paint[v]` entry that `ownsPaint` rejects. Use integer-flooring and the existing `num` helper style.
- [ ] **Step 4: Run** `npx vitest run src/game/save.test.ts`. Expected: PASS (old tests too).
- [ ] **Step 5: Commit**

```bash
git add src/game/save.ts src/game/save.test.ts
git commit -m "Save premium balance, bought paints and BRT ad progress; grandfather chosen paints"
```

### Task 3: Store actions: buy a paint, unlock with premium, count an ad view

**Files:**
- Modify: `src/game/store.ts` (`State` type, `setPaint` line 106, `unlock` line 113, `save()` line 144, dev shortcuts lines 46-47)
- Test: `src/game/store.test.ts`

**Interfaces:**
- Consumes: Task 1 helpers and Task 2 `Saved` fields.
- Produces on `State`:
  - `buyPaint: (v: VehicleId, paintId: string) => boolean` (true if bought now; selects it on success; false and no change if unknown, free, already owned, or `premium` below `paintPrice`)
  - `setPaint: (v, paint) => void` now ignores a paint the player does not own
  - `unlock: (v: VehicleId) => void` now pays `locked.premium` from `premium` (no-op if not locked, already unlocked, or too poor); selects the vehicle on success
  - `addAdView: (v: VehicleId) => number` records one completed ad view for a locked, not yet unlocked vehicle, unlocks and selects it when views reach `locked.ads`, and returns the new view count (0 when it changed nothing)
- Dev shortcuts: `?premium=N` sets `premium` to N; `?unlock=all` also sets `ownedPaints` to every paint key of every vehicle. Keep the existing `unlock=all` lines' style and comment that the shortcuts go when payments land.

- [ ] **Step 1: Add tests** to `store.test.ts` (reset `premium`, `ownedPaints`, `adViews`, `unlocked`, `paint` in `beforeEach`):
  - `buyPaint` pays once: with `premium: 150`, `buyPaint('okada','red')` returns true, premium is 50, `ownedPaints` contains `'okada/red'`, `paint.okada === 'red'`; a second call returns false and premium stays 50.
  - `buyPaint` with `premium: 99` returns false, changes nothing; `buyPaint('okada', <default id>)` and `buyPaint('okada','nope')` return false.
  - `setPaint('okada','red')` without owning does nothing; after `buyPaint` it works; setting the default always works.
  - `unlock('brt')` with `premium: 500` unlocks, selects the BRT, premium becomes 0; with 499 does nothing; on an already unlocked BRT does not charge again; `unlock('okada')` (not locked) does nothing.
  - `addAdView('brt')` unlocks at 1 view (the placeholder rule) and returns 1; a second call on the unlocked BRT returns 0 and changes nothing; `addAdView('okada')` returns 0.
- [ ] **Step 2: Run** `npx vitest run src/game/store.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the actions and add the three fields to the `save()` object. Share one small internal helper for "add to `unlocked` and select" used by both `unlock` and `addAdView`. No ads code here: the ad itself is shown by the UI (Task 4); the store only counts a view that already completed.
- [ ] **Step 4: Run** `npx vitest run src/game/store.test.ts`, then `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/game/store.ts src/game/store.test.ts
git commit -m "Store: buy paints and unlock the BRT with premium currency or ad views"
```

### Task 4: Rewarded ad provider stub

**Files:**
- Create: `src/game/ads.ts`, `src/game/ads.test.ts`

**Interfaces:**
- Produces:
  - `type AdProvider = () => Promise<boolean>` (resolves true only if the player watched to the end)
  - `setAdProvider(p: AdProvider | null): void`
  - `adsAvailable(): boolean` true when a provider is set
  - `showRewardedAd(): Promise<boolean>` returns false when no provider is set, and false if the provider throws or rejects
- Default: in `import.meta.env.DEV` the provider is a stub that resolves true after about 800 ms; in production there is none, so `adsAvailable()` is false until the real AdSense integration (spec step 2) calls `setAdProvider`.

- [ ] **Step 1: Write tests:** no provider means `adsAvailable()` false and `showRewardedAd()` resolves false; a provider resolving true gives true; resolving false gives false; a throwing provider gives false (not a rejection). Reset with `setAdProvider(null)` in `afterEach`.
- [ ] **Step 2: Run** `npx vitest run src/game/ads.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `ads.ts` as described. Comment that this file is the only place the real ad network plugs in.
- [ ] **Step 4: Run** `npx vitest run src/game/ads.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/game/ads.ts src/game/ads.test.ts
git commit -m "Rewarded ad provider seam with a dev-only stub"
```

### Task 5: Garage UI, docs and mobile check

**Files:**
- Modify: `src/ui/Garage.tsx`, `src/styles.css` (near `.paints` line 125), `CLAUDE.md` (the "Colours are paint options" line)
- Check only: `src/ui/Lobby.tsx` line 75 filter, `src/ui/Menu.tsx`, `src/ui/Online.tsx` (they should work unchanged because `paint[v]` is always an owned paint)

**Interfaces:**
- Consumes: store `premium`, `ownedPaints`, `adViews`, `buyPaint`, `unlock`, `addAdView`, `setPaint`; `paintPrice`, `ownsPaint`, `PREMIUM_LABEL`, `showRewardedAd`, `adsAvailable`.

Behaviour to build:
- Header shows the premium balance next to the naira: `{PREMIUM_LABEL} {premium}`.
- Each swatch of an unowned paint shows a lock mark and its price in its `aria-label`. Tapping any swatch previews that colour on the 3D vehicle. Tapping an owned swatch also selects it. Tapping an unowned one does not.
- With an unowned paint previewed, the main button reads `Buy {name} for {price} {PREMIUM_LABEL}`, or `Need {n} more {PREMIUM_LABEL}` and disabled when short. Buying selects it. The preview resets when the vehicle tab changes.
- BRT, locked: two choices. `Watch an ad ({views}/{ads})` shown only when `adsAvailable()`; it awaits `showRewardedAd()` and calls `addAdView` only on true; disabled while the ad runs. `Unlock for {premium} {PREMIUM_LABEL}`, or the `Need {n} more` text when short. Show a short line that the ad is optional and uses mobile data.
- No naira text on the BRT any more.

- [ ] **Step 1: Implement the Garage changes above.** Keep the component small; extract a `PaintPicker` and `LockedActions` component in the same file only if `Garage` grows unwieldy.
- [ ] **Step 2: Update `CLAUDE.md`** vehicles paragraph: default paint is yellow, other paints cost premium currency, the BRT unlocks by ad or premium currency (placeholder values live in `src/config/premium.ts` and `vehicles.ts`).
- [ ] **Step 3: Run** `npm run typecheck && npx vitest run`. Expected: no errors, all tests pass.
- [ ] **Step 4: Verify in the browser** (preview_start, `?premium=300` on the URL): on a 375×812 mobile viewport and on desktop, check that the Okada starts yellow; a red swatch previews on the model without being selected; buying it takes 100 off the balance and selects it; the BRT shows both unlock choices and the stub ad unlocks it; the room lobby (`Race with friends`) lists the BRT only after it is unlocked. Take a screenshot of the Garage on mobile for the user.
- [ ] **Step 5: Commit**

```bash
git add src/ui/Garage.tsx src/styles.css CLAUDE.md
git commit -m "Garage: paid skins with preview and the BRT ad-or-premium unlock"
```

---

## Self-review

- Spec coverage: yellow defaults (Task 1), paid other paints (Tasks 1, 3, 5), BRT by ad or premium (Tasks 1, 3, 4, 5), naira unchanged (Task 3 leaves coins alone), cosmetic only (no stat code touched), save and rollout notes (Task 2, Known limit). The spec's open items (name, prices, ad count) stay placeholders, as the spec says.
- Not in this plan on purpose: Paystack, accounts, server wallet, the real ad network, room-side paint checks (spec steps 2 to 4).
- Conflict to resolve before step 3: `docs/superpowers/specs/2026-10-04-vehicle-upgrades-design.md` still lists naira prices for unlocking the BRT. This plan supersedes that line.
