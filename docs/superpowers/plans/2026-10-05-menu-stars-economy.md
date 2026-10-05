# Simpler Menu, Stars and the Naira Economy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two-entry main menu, per-race stars that decide the naira payout, one coherent naira economy, and a rotate-your-phone prompt that forces landscape on phones.

**Architecture:** Pure rules (stars, payouts, room cap, pacing) live in `src/config/economy.ts` and `src/game/campaign.ts` and are tested without React. The save gains `campaign.stars` and `roomEarned`; the store's `finishRace` becomes the single place money is paid. UI changes (Menu, Campaign, Results, RotatePrompt) read from the store.

**Tech Stack:** Vite, React, TypeScript, zustand (`useGame`), vitest (node environment, no DOM testing library: UI is verified in the browser pane).

**Spec:** `docs/superpowers/specs/2026-10-05-menu-stars-economy-design.md`

**Work on:** a new branch `feature/menu-stars-economy` from `main` in its own worktree. The main checkout has uncommitted work belonging to the drivers feature; never touch it.

## Global Constraints

- Stars by place: 1st = 3, 2nd = 2, 3rd = 1, 4th or lower = 0. The duel (`campaign-1-4`) has `stars: [3]` (win = 3, lose = 0).
- Payout by stars: `PAYOUT_BY_STARS = [0, 30_000, 60_000, 100_000]`. Zero stars pays ₦0. Paid every time a race is run, by the stars earned **in that run**; there is no first-clear bonus and no quick race.
- Saved best stars only ever go up. Passing a race = at least 1 star. `campaign.cleared` stays and means "has at least 1 star" (it drives driver unlocks and race gating).
- Only race 1 is open at the start; each later race opens when the one before it is cleared (existing `campaignStatus` gating, unchanged).
- Room races pay the same table at `ROOM_PAYOUT_MULTIPLIER = 0.5` with `ROOM_DAILY_CAP = 300_000` naira per local calendar day. DNF and 4th or lower pay ₦0.
- Upgrade prices (`UPGRADE_PRICES = [80_000, 120_000, 160_000, 200_000, 260_000]`) and the BRT price (₦2,000,000) are unchanged. The saved naira field keeps its name `coins`.
- The main menu has exactly two entries: Single player and Multiplayer. Garage and Settings are small secondary buttons. The OpenStreetMap credit stays in the menu.
- Rotate prompt: shown on `(pointer: coarse) and (orientation: portrait)`, over every screen. A solo race pauses while it is shown and stays paused when the phone is turned back.
- No real brand logos; naira amounts are shown with `formatNaira`.
- Test on a mobile viewport (375x812 portrait, 812x375 and 640x360 landscape). Budget Android phones on mobile data: no new dependencies.

## Review Focus

1. A save from before this change (`campaign.cleared` set, no `stars`) must load with every cleared race at 1 star, and junk in `stars` (unknown ids, 4, -1, "x") must be dropped. Pinned in Task 3.
2. Replaying a race and finishing lower than your best pays this run's stars, and leaves the saved best untouched. Pinned in Task 2.
3. A nonsense place (0, NaN, 2.5, -1) or a DNF earns 0 stars and ₦0, never a crash or free money. Pinned in Tasks 1 and 4.
4. Room earnings near the daily cap pay only what is left (earned 280,000, payout 50,000 pays 20,000), the next local day starts from 0, and a corrupt `roomEarned` in the save is treated as 0 today. Pinned in Tasks 1 and 3.
5. The menu header must not show a fixed "Ojuelegba Grand Prix" any more now that the track picker is gone (that was the bug just fixed). Pinned in Task 6.

---

### Task 1: Economy rules (stars, payouts, room cap)

**Files:**
- Modify: `src/config/economy.ts`
- Modify: `src/config/economy.test.ts`

**Interfaces:**
- Consumes: existing `UPGRADE_PRICES`, `MAX_UPGRADE_LEVEL`, `formatNaira`, `upgradePrice` (unchanged).
- Produces (all exported from `src/config/economy.ts`):
  - `type Stars = 0 | 1 | 2 | 3`
  - `DEFAULT_STARS: number[]` = `[3, 2, 1]` (stars by 1-based place)
  - `PAYOUT_BY_STARS: readonly [0, 30_000, 60_000, 100_000]`
  - `ROOM_PAYOUT_MULTIPLIER = 0.5`, `ROOM_DAILY_CAP = 300_000`
  - `starsForPlace(table: number[], place: number): Stars` (table entry for a valid 1-based place, 0 beyond the table or for nonsense)
  - `payoutForStars(stars: number): number`
  - `roomPayout(place: number, dnf: boolean, earnedToday: number): { naira: number; capped: boolean }` (`capped` is true when the cap reduced or zeroed a payout that would otherwise have been above 0)
- Removes: `PAYOUTS`, `payoutForPlace`.

- [ ] **Step 1: Write the failing tests** in `src/config/economy.test.ts`. Delete the `payoutForPlace` describe. Add:
  - `starsForPlace`: `[1,2,3,4,5,6].map(p => starsForPlace(DEFAULT_STARS, p))` equals `[3,2,1,0,0,0]`; `starsForPlace([3], 2)` is 0; places `0, -1, NaN, 2.5, Infinity` give 0.
  - `payoutForStars`: 0→0, 1→30_000, 2→60_000, 3→100_000; `4`, `-1`, `NaN` give 0.
  - `roomPayout`: place 1 with 0 earned → `{ naira: 50_000, capped: false }`; place 2 → 30_000; place 3 → 15_000; place 4 and a DNF → `{ naira: 0, capped: false }`; place 1 with 280_000 earned → `{ naira: 20_000, capped: true }`; place 1 with 300_000 earned → `{ naira: 0, capped: true }`; place 4 with 300_000 earned → `{ naira: 0, capped: false }`; earned above the cap (310_000) pays 0.
  - Pacing: with `avgPodium = (100_000 + 60_000 + 30_000) / 3`, `UPGRADE_PRICES[0] / avgPodium <= 2`; the whole upgrade ladder times 3 stats (`sum(UPGRADE_PRICES) * 3 / avgPodium`) is between 25 and 50; the BRT price from `vehicleById('brt').locked.coins / avgPodium` is between 20 and 40.
  - Keep the existing `formatNaira`, `upgradePrice` and vehicle-price tests; change the vehicle-price test description only if it mentions payouts.
- [ ] **Step 2: Run** `npx vitest run src/config/economy.test.ts`. Expected: FAIL (`starsForPlace is not a function` / missing exports).
- [ ] **Step 3: Implement** the interfaces above in `economy.ts`. Update the file's header comment to describe stars-based payouts and the pacing (about 39 podium races to fully upgrade one vehicle). `roomPayout` = `Math.floor(payoutForStars(starsForPlace(DEFAULT_STARS, place)) * ROOM_PAYOUT_MULTIPLIER)` unless `dnf`, then clamped to `max(0, ROOM_DAILY_CAP - earnedToday)`.
- [ ] **Step 4: Run** `npx vitest run src/config/economy.test.ts`. Expected: PASS. (Whole-project `tsc` will fail until Task 2; that is expected here.)
- [ ] **Step 5: Commit** `git add src/config/economy.ts src/config/economy.test.ts && git commit -m "Economy: stars, payout-by-stars and the room daily cap"`

### Task 2: Campaign rules (stars on specs, settle)

**Files:**
- Modify: `src/config/campaign.ts`
- Modify: `src/game/campaign.ts`
- Modify: `src/game/campaign.test.ts`

**Interfaces:**
- Consumes (Task 1): `Stars`, `DEFAULT_STARS`, `starsForPlace`, `payoutForStars`.
- Produces:
  - `RaceSpec` loses `coins` and `firstClearCoins`; gains `stars?: number[]` (table for `starsForPlace`; missing means `DEFAULT_STARS`). `CHAPTER_1[3]` has `stars: [3]`. `QUICK_COINS` is deleted.
  - `type CampaignSave = { cleared: string[]; stars: Record<string, Stars> }` exported from `src/game/campaign.ts`.
  - `sanitizeStars(raw: unknown, chapter?: RaceSpec[]): Record<string, Stars>` (known ids only; values must be integers 1-3; anything else is dropped).
  - `settle(spec: RaceSpec, place: number, saved: CampaignSave): Settled` where `Settled = { stars: Stars; payout: number; newBest: boolean; passed: boolean; firstClear: boolean; saved: CampaignSave; unlocked: DriverId | null }`. `payout` is `payoutForStars(stars)` for **this run**; `saved.stars[spec.id]` is `max(previous, stars)` (only written when ≥ 1); `saved.cleared` gains `spec.id` when stars ≥ 1 and it was absent; `firstClear` is true only when that happens; `unlocked` is `spec.reward?.driver` only on `firstClear`; `newBest` is true when `stars` exceeds the previous best (previous 0 counts) and `stars ≥ 1`; `passed` is `place <= spec.pass.place`.
  - `evaluatePass`, `campaignStatus`, `nextRace`, `sanitizeCleared`, `driverAvailable` are unchanged. `coinsForPlace` is deleted.

- [ ] **Step 1: Write the failing tests** in `campaign.test.ts`. Replace the `coinsForPlace` describe and the old payout/bonus pins. Add, using `CHAPTER_1` and a `fresh = { cleared: [], stars: {} }` saved state:
  - `CHAPTER_1.map(r => r.stars)` equals `[undefined, undefined, undefined, [3]]`; `CHAPTER_1.map(r => r.pass.place)` still `[3, 3, 3, 1]`.
  - `settle(r1, 1, fresh)` → stars 3, payout 100_000, newBest true, passed true, firstClear true, `saved` `{ cleared: ['campaign-1-1'], stars: { 'campaign-1-1': 3 } }`.
  - Place 2 → stars 2, payout 60_000; place 3 → stars 1, payout 30_000; place 4 → stars 0, payout 0, passed false, `saved` equal to `fresh`, newBest false.
  - Replay after a best of 3: `settle(r1, 3, { cleared: ['campaign-1-1'], stars: { 'campaign-1-1': 3 } })` → stars 1, payout 30_000, newBest false, firstClear false, `saved.stars['campaign-1-1']` still 3.
  - Replay improving 1 → 2: newBest true, `saved.stars` is 2, firstClear false.
  - Duel: place 1 → stars 3, payout 100_000, `unlocked` `'mamaput'`; place 2 → stars 0, payout 0, no unlock; winning it a second time → no unlock again.
  - Nonsense places (0, NaN, 2.5, -1) on a normal race: stars 0, payout 0, passed false.
  - `sanitizeStars({ 'campaign-1-1': 3, 'campaign-1-2': 4, 'campaign-1-3': 'x', nope: 2, 'campaign-1-4': 0 })` → `{ 'campaign-1-1': 3 }`; non-object input → `{}`.
- [ ] **Step 2: Run** `npx vitest run src/game/campaign.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the interfaces. In `settle`, compute `stars = starsForPlace(spec.stars ?? DEFAULT_STARS, place)`. Remove the `spec === null` branch (rooms no longer go through `settle`; see Task 4). Update `config/campaign.ts` comments and the `RaceSpec` doc; keep titles, stories, modes, `pass`, `reward`, `taunts` as they are.
- [ ] **Step 4: Run** `npx vitest run src/game/campaign.test.ts src/config`. Expected: PASS.
- [ ] **Step 5: Commit** `git add -A src/config src/game/campaign.ts src/game/campaign.test.ts && git commit -m "Campaign: stars per race and payout by stars"`

### Task 3: Save format (stars, room earnings, migration)

**Files:**
- Modify: `src/game/save.ts`
- Modify: `src/game/save.test.ts`

**Interfaces:**
- Consumes (Task 2): `CampaignSave`, `sanitizeStars`, `sanitizeCleared`.
- Produces: `Saved.campaign: CampaignSave`; new `Saved.roomEarned: { day: string; naira: number }`; `defaultSave().roomEarned` is `{ day: '', naira: 0 }`; exported `todayKey(now?: Date): string` returning the local date as `YYYY-MM-DD`; exported `roomEarnedToday(saved: Pick<Saved, 'roomEarned'>, now?: Date): number` returning `roomEarned.naira` if `roomEarned.day === todayKey(now)` else 0.

- [ ] **Step 1: Write the failing tests** in `save.test.ts`:
  - `normaliseSave({ campaign: { cleared: ['campaign-1-1', 'campaign-1-2'] } }).campaign` equals `{ cleared: ['campaign-1-1', 'campaign-1-2'], stars: { 'campaign-1-1': 1, 'campaign-1-2': 1 } }`.
  - With `stars: { 'campaign-1-1': 3 }` and `cleared: ['campaign-1-1', 'campaign-1-2']` → stars `{ 'campaign-1-1': 3, 'campaign-1-2': 1 }`.
  - Stars with no `cleared` entry for them: a race with `stars` of 2 but absent from `cleared` ends up in `cleared` too (cleared is derived from "has at least 1 star" plus the old list).
  - Junk stars (`{ 'campaign-1-1': 9, bogus: 2 }`) are dropped; a `v1` save migrates with `campaign` `{ cleared: [], stars: {} }`.
  - `todayKey(new Date(2026, 9, 5, 23, 59))` is `'2026-10-05'` and `todayKey(new Date(2026, 9, 6, 0, 1))` is `'2026-10-06'`.
  - `roomEarnedToday({ roomEarned: { day: '2026-10-05', naira: 120_000 } }, new Date(2026, 9, 5, 12))` is 120_000; the next day it is 0.
  - `normaliseSave({ roomEarned: { day: 5, naira: 'x' } }).roomEarned` equals `{ day: '', naira: 0 }`; a negative or non-finite `naira` becomes 0.
- [ ] **Step 2: Run** `npx vitest run src/game/save.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** in `save.ts`: `normaliseSave` builds `stars = sanitizeStars(raw.campaign?.stars)`, then `cleared = sanitizeCleared([...rawCleared, ...Object.keys(stars)])`, then adds `1` for every `cleared` id missing from `stars`. Keep `driverAvailable(driver, cleared)` as it is. Update the header comment (still version 2; the new fields are additive, no key change).
- [ ] **Step 4: Run** `npx vitest run src/game/save.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `git add src/game/save.ts src/game/save.test.ts && git commit -m "Save: campaign stars, room earnings and migration"`

### Task 4: Store pays by stars; rooms pay half with a cap

**Files:**
- Modify: `src/game/store.ts`
- Modify: `src/game/store.test.ts`
- Modify: `src/net/store.ts` (the `finishRace` call near line 237)
- Modify: `src/net/results.ts` (delete `DNF_COINS` and `coinsFor`; keep `toResults`)
- Modify: `src/game/race.ts` and `src/game/race.test.ts` (delete `coinsForPlace` and its test)
- Modify: `src/net/results` tests, if any reference `coinsFor` (run `grep -rn "coinsFor\|DNF_COINS" src server` to find them)

**Interfaces:**
- Consumes: `settle` (Task 2), `roomPayout` (Task 1), `roomEarnedToday`/`todayKey` (Task 3).
- Produces:
  - `finishRace(results: Result[], place: number, bestLap: number | null, room?: { trackId: string; dnf: boolean }): void`. Solo (`room` absent) requires `s.spec`; if `spec` is null and `room` is absent, do nothing but record results (cannot happen once the quick race is gone).
  - `Outcome = { place: number; stars: Stars; newBest: boolean; passed: boolean; firstClear: boolean; unlocked: DriverId | null }`.
  - New state fields: `earnedStars: Stars` (stars of the run just finished, 0 for rooms), `roomCapped: boolean`, plus `roomEarned` from `Saved` kept current. `coinsEarned` still holds the naira paid by the last race.
  - `startRace(spec: RaceSpec)` now requires a spec; `startOnlineRace` is unchanged.
  - `?unlock=all` sets `initial.unlocked = ['brt']` and `initial.campaign = { cleared: all ids, stars: all ids → 3 }`.
- Behaviour: solo pays `settled.payout`, stores `settled.saved` as `campaign`. Room pays `roomPayout(place, dnf, roomEarnedToday(s)).naira`, adds it to `roomEarned` (resetting `day`/`naira` when the stored day is not today), and sets `roomCapped`. `save()` writes `roomEarned`.

- [ ] **Step 1: Write the failing tests** in `store.test.ts` (reset state with `campaign: { cleared: [], stars: {} }`, `roomEarned: { day: '', naira: 0 }`, `coins: 0`). Replace the old `finishRace`/`startRace` tests (the quick-race ones go; `setDriver` and the `buyUpgrade`/`unlock` describes stay):
  - Solo 2nd place on race 1 → `coins` 60_000, `coinsEarned` 60_000, `earnedStars` 2, `campaign.stars['campaign-1-1']` 2, `outcome` `{ place: 2, stars: 2, newBest: true, passed: true, firstClear: true, unlocked: null }`; the same race again, 2nd place → coins 120_000, `outcome.newBest` false, `firstClear` false.
  - Replay finishing 3rd after a best of 3 stars pays 30_000 and keeps the saved best 3.
  - Lost duel pays 0, clears nothing, no unlock; won duel pays 100_000, clears `campaign-1-4`, unlocks `'mamaput'`.
  - 4th place pays 0 and `coins` is unchanged.
  - Room, place 1, earned today 0 → coins 50_000, `roomEarned.naira` 50_000, `roomCapped` false, `outcome` null; a room DNF pays 0; with `roomEarned: { day: todayKey(), naira: 280_000 }` a 1st place pays 20_000 and `roomCapped` is true; with a `day` that is not today, the payout starts from 0 and `roomEarned.day` becomes today.
  - Best lap is filed under the race's track: `finishRace([], 1, 70)` after `startRace(CHAPTER_1[1])` → `best` `{ 'third-mainland': 70 }`; a room finish with `trackId: 'ikorodu'` files under `'ikorodu'`.
- [ ] **Step 2: Run** `npx vitest run src/game/store.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the store changes above; update `src/net/store.ts` to call `game.finishRace(toResults(...), mine.place, mine.best, { trackId: ..., dnf: mine.dnf })`; delete `coinsFor`/`DNF_COINS` and the old `coinsForPlace` in `race.ts` with their tests. Remove `QUICK_COINS` imports everywhere.
- [ ] **Step 4: Run** `npx tsc --noEmit && npx tsc --noEmit -p server && npx vitest run`. Expected: type errors only in UI files that Tasks 5-7 fix (`Results.tsx` uses `spec.firstClearCoins`, `Menu.tsx` calls `launchRace()`); if so, make the minimum compile fixes in this task (`Results.tsx`: remove the first-clear text; `Menu.tsx`: `launchRace(spec: RaceSpec)`, delete the "OYA, RACE!" button) so the tree builds, and Tasks 5-7 finish the real UI. All tests PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "Store pays by stars; rooms pay half with a daily cap"`

### Task 5: Results screen and campaign cards show stars and the payout

**Files:**
- Create: `src/ui/Stars.tsx`
- Modify: `src/ui/Results.tsx`
- Modify: `src/ui/Campaign.tsx`
- Modify: `src/styles.css` (new `.stars`, `.reward-ladder`, `.new-best` rules, in the existing style)
- Create: `src/ui/stars.test.ts`

**Interfaces:**
- Consumes: store fields from Task 4 (`outcome`, `earnedStars`, `coinsEarned`, `roomCapped`, `campaign.stars`), `PAYOUT_BY_STARS`, `formatNaira`.
- Produces:
  - `src/ui/Stars.tsx`: `export function Stars({ earned, of = 3, label }: { earned: number; of?: number; label?: string })` rendering `of` glyphs (★ filled, ☆ empty) as one element with `role="img"` and `aria-label` `` `${earned} of ${of} stars` `` (or `label`).
  - The pure helper below also lives in `src/ui/Stars.tsx`: `export const payoutLine = (place: number, stars: number, naira: number) => string` returning `` `${ordinal} place: ${'★'.repeat(stars) || 'no stars'} = ${formatNaira(naira)}` `` with ordinals `1st`…`6th` and `` `${place}th` `` beyond. The test file `src/ui/stars.test.ts` imports `payoutLine` (it must not import React components that need a DOM).

- [ ] **Step 1: Write the failing tests** in `src/ui/stars.test.ts`: `payoutLine(2, 2, 60_000)` is `'2nd place: ★★ = ₦60,000'`; `payoutLine(1, 3, 100_000)` is `'1st place: ★★★ = ₦100,000'`; `payoutLine(5, 0, 0)` is `'5th place: no stars = ₦0'`.
- [ ] **Step 2: Run** `npx vitest run src/ui/stars.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `Stars.tsx`. In `Results.tsx`: show `<Stars earned={earnedStars} />` in the head for solo races, a "New best!" badge when `outcome?.newBest`, and the earned line `+ ₦X` with `payoutLine` below it; for rooms show `+ ₦X` with the note "Room races pay half" and, when `roomCapped`, "Daily room limit reached"; when nothing was earned in a solo race show "No stars, no naira. Finish top 3." Remove the first-clear text and the "Race again / Garage / Menu" quick-race branch (spec is always set when not online). In `Campaign.tsx`: each card shows `<Stars earned={campaign.stars[spec.id] ?? 0} />`; the intro modal shows a reward ladder of the three star levels with their payouts from `PAYOUT_BY_STARS` (duel: only ★★★ line); locked cards read "Pass the previous race to unlock" instead of "Locked"; the header coins use `formatNaira(coins)`.
- [ ] **Step 4: Run** `npx tsc --noEmit && npx vitest run`. Expected: PASS. Then check in the browser (see Task 8 for the viewport list): finish a race and confirm stars, payout and `New best!` appear and match the Garage balance.
- [ ] **Step 5: Commit** `git add -A && git commit -m "Results and campaign show stars and what each pays"`

### Task 6: Two-entry main menu

**Files:**
- Modify: `src/ui/Menu.tsx`
- Modify: `src/styles.css` (menu layout for landscape phones; remove `.track-picker`/`.track-chip` rules once unused)
- Create: `src/ui/menuText.test.ts`

**Interfaces:**
- Consumes: store `vehicle`, `coins`, `paint`, `driver`, `setScreen`; `TRACKS` (for the credit line only).
- Produces: `export const MENU_TAGLINE = 'Race the streets of Lagos'` and `export const menuCredit = (tracks: { credit?: string }[]): string | null` exported from `src/ui/menuText.ts` (create this file; it must not import React). `Menu.tsx` exports `goFullscreen` and `launchRace(spec: RaceSpec)` as before.

- [ ] **Step 1: Write the failing tests** in `src/ui/menuText.test.ts`: `MENU_TAGLINE` does not contain `'Grand Prix'`; `menuCredit([{ }, { credit: '© OpenStreetMap contributors' }])` is `'© OpenStreetMap contributors'`; `menuCredit([{}])` is null.
- [ ] **Step 2: Run** `npx vitest run src/ui/menuText.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Menu body: header with `MENU_TAGLINE` in the small line (replacing `eventName(t)`), `LAGOS RACER`, the naira balance; the "Your ride" card with vehicle, driver and blurb (no track picker, no track line, no best lap); two large buttons, **SINGLE PLAYER** (`setScreen('campaign')`, primary) and **MULTIPLAYER** (`setScreen('online')`); small **Garage** and **Settings** buttons in a separate row; the credit line from `menuCredit(TRACKS)` (e.g. "Ojuelegba road layout © OpenStreetMap contributors"); keep the keyboard-hint line. Remove unused imports (`eventName`, `trackOrDefault`, `formatTime`, `setTrack`/`track`/`best` reads). The store's `track`/`setTrack` stay (rooms and saves use them).
- [ ] **Step 4: Run** `npx tsc --noEmit && npx vitest run`. Expected: PASS. In the browser at 812x375 and 640x360: exactly two large entry buttons, nothing overflows, no "Grand Prix" in the header.
- [ ] **Step 5: Commit** `git add -A && git commit -m "Main menu: Single player and Multiplayer only"`

### Task 7: Rotate prompt and portrait cleanup

**Files:**
- Create: `src/ui/RotatePrompt.tsx`
- Create: `src/ui/rotate.ts` (pure logic)
- Create: `src/ui/rotate.test.ts`
- Modify: `src/App.tsx` (mount once, after the screens)
- Modify: `src/styles.css` (prompt styles; delete the four `@media (max-width: 720px) and (orientation: portrait)` blocks around lines 98, 173, 277, 406 after checking each is dead in landscape)

**Interfaces:**
- Produces in `src/ui/rotate.ts`: `shouldPromptRotate(coarse: boolean, portrait: boolean): boolean` (true only when both are true) and `shouldPauseForRotate(prompting: boolean, screen: string, online: boolean, paused: boolean): boolean` (true only when prompting, `screen === 'race'`, not online and not already paused).
- Produces `RotatePrompt()` in `RotatePrompt.tsx`: subscribes to `matchMedia('(pointer: coarse)')` and `matchMedia('(orientation: portrait)')` change events, renders nothing when `shouldPromptRotate` is false, otherwise a full-screen overlay (`role="alert"`, above everything including the race canvas and modals) with an animated phone icon and the text "Turn your phone sideways to play". It calls `useGame.getState().setPaused(true)` whenever `shouldPauseForRotate(...)` holds, and never calls `setPaused(false)`.

- [ ] **Step 1: Write the failing tests** in `rotate.test.ts`: the four combinations of `shouldPromptRotate`; `shouldPauseForRotate(true, 'race', false, false)` is true; each of `false` prompting, `screen: 'menu'`, `online: true` and `paused: true` makes it false.
- [ ] **Step 2: Run** `npx vitest run src/ui/rotate.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the three files; mount `<RotatePrompt />` in `App`. Remove the dead portrait CSS and check the Garage, Campaign and Results layouts still hold at 812x375 and 640x360.
- [ ] **Step 4: Run** `npx tsc --noEmit && npx vitest run`. Expected: PASS. In the browser pane with the mobile preset (375x812, touch emulation on): the prompt covers the Menu, Garage, Campaign and a race; rotate to 812x375 and it disappears; start a solo race, rotate to portrait, confirm the race pauses and stays paused after rotating back; on desktop width the prompt never shows.
- [ ] **Step 5: Commit** `git add -A && git commit -m "Rotate prompt for phones held upright; drop portrait layouts"`

### Task 8: Docs, full check and hand-off

**Files:**
- Modify: `CLAUDE.md` (campaign paragraph: stars, payouts, gating, two-entry menu; remove "OYA, RACE!" mentions; accounts line unchanged)
- Modify: `docs/superpowers/specs/2026-10-04-campaign-design.md` only if it states first-clear coins (add a one-line "superseded by 2026-10-05-menu-stars-economy-design.md" note, nothing else)

- [ ] **Step 1:** Update `CLAUDE.md`: the single-player campaign paragraph now says races pay by stars (₦100,000 / 60,000 / 30,000, nothing below 3rd), best stars are saved, only race 1 starts open, rooms pay half with a ₦300,000 daily cap, and the main menu has only Single player and Multiplayer; add one line that phones are forced to landscape with a rotate prompt.
- [ ] **Step 2: Run** `npx tsc --noEmit && npx tsc --noEmit -p server && npx vitest run && npx vite build`. Expected: all pass, build succeeds.
- [ ] **Step 3: Browser pass** on 375x812 portrait, 812x375 and 640x360 landscape: menu (two entries), campaign (only race 1 open, no stars yet), play race 1 and finish top 3 (stars, payout and `New best!` correct, balance updated, race 2 opens), replay worse (payout follows the run, best unchanged), `?unlock=all` (all races open with three stars), Garage buy of the first upgrade after one good race, a two-phone room race (pays half, shows "Room races pay half"). Record any failure and fix it before the next step.
- [ ] **Step 4: Commit** `git add -A && git commit -m "Document the stars economy and landscape play"`
- [ ] **Step 5:** Ask for the final branch review, then merge `feature/menu-stars-economy` into `main` only when the user says so.
