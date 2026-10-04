# Campaign: Chapter 1, elimination and the Mama Put duel

Tracked in GitHub issue [#4](https://github.com/Posiislight/lagos-racer/issues/4).

## Goal

Give single-player a spine: a **campaign** whose Chapter 1 is four races on two maps. It adds two new race modes
(**elimination** and a **1-on-1 duel**) and unlocks **Mama Put** as a playable driver when you beat her. The free
"quick race" stays as it is.

### Decisions made (with the user, 4 October)

- Chapter 1 has 4 races, 2 per map: Ojuelegba, Ikorodu Garage, Ojuelegba (elimination), Ikorodu Garage (Mama Put duel).
- Beating Mama Put unlocks her as a **driver** (not a vehicle). Drivers and their specials already exist.
- **Podium to advance:** top 3 in the lap races and the elimination, a win in the duel. Failing means retrying.
- **Elimination is a countdown timer:** about every 20 s the racer in last place is out.
- **The duel is hard through skill, not tricks:** Mama Put drives at high skill with no rubber band, items on for both.
- Both maps now exist: Ojuelegba (the real road) and Ikorodu Garage (`2026-10-04-ikorodu-garage-track-design.md`,
  on branch `ikorodu-track`). Races 2 and 4 use the real `ikorodu` track; there is no stand-in. The campaign branch is
  cut from `ikorodu-track`.

### Assumptions (please correct in review)

- Elimination and the duel are driven on out-and-back roads (both tracks are). The mode logic only uses unwrapped
  distance, so it does not care about the track's shape.
- In campaign races 1–3, rivals never drive as Mama Put, so meeting her in race 4 is an event. Quick race is
  unchanged: rivals pick any driver.
- If the player is eliminated in race 3, the race ends at once. They don't watch the rest.
- Quick race keeps the track picker it has now (saved `track`) and is otherwise unchanged. The campaign always uses
  the track named in its race spec.
- Coin amounts and all story text below are placeholders to tune.

### Out of scope

- Any further chapters.
- Multiplayer. Mode logic is kept pure so a server could reuse it, but no multiplayer code is written here.
- Accounts: campaign progress is saved in localStorage like coins, and moves to the account later.
- Letting the player pick a track in quick race; star ratings; new vehicles.

## The four races

All values live in `src/config/campaign.ts` so tuning stays in one place.

| # | Id | Title | Track | Mode | Racers | Pass rule |
|---|---|---|---|---|---|---|
| 1 | `campaign-1-1` | Ojuelegba Hustle | `ojuelegba` | laps, 3 laps | you + 5 rivals | place ≤ 3 |
| 2 | `campaign-1-2` | Ikorodu Garage Run | `ikorodu` | laps, 3 laps | you + 5 rivals | place ≤ 3 |
| 3 | `campaign-1-3` | LASTMA Is Coming | `ojuelegba` | elimination | you + 5 rivals | place ≤ 3 |
| 4 | `campaign-1-4` | Mama Put's Challenge | `ikorodu` | duel, 2 laps | you + Mama Put | place = 1 |

Race N+1 opens when race N is cleared. Cleared races can be replayed. Coins are paid on every attempt by place
from a table on the spec (`coins`, the last entry repeats): the existing `[150, 100, 60, 30, 20]` for races 1–3, and
`[200, 40]` for the duel (200 for a win, 40 for a loss). On top of that comes a **first-clear bonus** (`firstClearCoins`),
paid once: +100 for races 1–3 and +300 for the duel. A reward on the spec (`reward: { driver: 'mamaput' }`) is
granted on the first clear. Quick race keeps `[150, 100, 60, 30, 20]` and has no bonus.

For elimination, "place ≤ 3" means the same as "not one of the first three knocked out", because the ranking is the
reverse knock-out order (below). So the pass rule is one rule, `{ place: n }`, for all three modes.

## Race modes

A mode is a small pure module in `src/game/modes.ts`, built from the race spec by `createMode(spec.mode)`. It never
touches Three.js or Rapier: it works on a structural view of the race that a `RaceRuntime` already satisfies
(`{ clock, phase, racers: { id, isPlayer, progress: { distance, finishTime }, outAt }[] }`), so it is unit-tested like
`race.ts` and could run on a server later. A mode instance holds its own state (the elimination timer and round), so
each race gets a fresh one.

```ts
type ModeEvent = { kind: 'eliminated'; racerId: number; round: number /* 1-based */ };
type Mode = {
  id: 'laps' | 'elimination' | 'duel';
  /** Advance the mode by dt while racing; sets `outAt` on whoever it eliminates and returns what happened. */
  tick(view: ModeView, dt: number): ModeEvent[];
  /** True once the race is decided and results can be shown. */
  over(view: ModeView): boolean;
  /** Racer ids, first place to last. */
  ranking(view: ModeView): number[];
  /** HUD data for the elimination timer, or null. */
  hud(view: ModeView): { left: number; total: number; timer: number; round: number } | null;
};
```

`RaceRuntime` gains `mode` and `spec`; `Racer` gains `outAt: number | null`. `RaceLogic.tsx` calls `mode.tick`, and the
finish and results block moves into `mode.over` and `mode.ranking`. Today that block is inline and lap-based; `laps` mode must reproduce it exactly
(player home, then wait for the others or 6 s), pinned by tests before anything else changes.

### laps

Current behaviour, extracted. Ranking is `standings`. Used by races 1 and 2.

### elimination (race 3)

- 6 racers, no lap limit. The race runs until one racer is left, so the HUD hides the lap counter and shows
  `Racers left n/6` and the countdown.
- The timer starts at the green light at **20 s** and shortens by 2 s each round, with a floor of 10 s
  (`interval(round) = max(10, 20 − 2 × round)`, round counted from 0). It pauses with the game.
- At zero, among racers still in, the one with the lowest unwrapped `distance` is out (distance can be negative on
  the grid; an exact tie goes to the lower id). That sets `outAt` and fires `eliminated`. The timer resets to the next
  interval.
- **The race is over** when one racer is left, or when the player is out.
- **Ranking:** racers still in, ordered by distance (best first), then eliminated racers in reverse knock-out order.
  The winner is last standing. If the player is knocked out, the race ends at once with several racers still in:
  those racers fill the places above the player (ordered by distance), so the player's place is the number of racers
  still in, plus one for each racer knocked out after them, plus one. Example: out in round 2 of 6 means 4 still in,
  so 5th.
- **Eliminated racer.** Controls are zeroed and it brakes to a stop. A placeholder wheel-clamp effect and the banner
  "<name> clamped by LASTMA" mark it. After about 2 s it fades out and its collider is removed so it never blocks the
  road. From `outAt` onward it is excluded from juju targeting, AI dodging, item pickups, specials and `standings`.
  One helper, `isIn(racer)`, is the single test for all of these.
- **Results** show "out at m:ss" in the time column for eliminated racers.

### duel (race 4)

- Two racers. Both start on the front row, side by side, in the two lanes, no head start.
- Mama Put drives **the player's vehicle** in a different paint (equal stats). Her driver is `mamaput`, so her Pepper
  Soup Trail is driven by the existing AI special logic.
- Her `ai.skill` comes from the spec (starting value 1.06) and the AI gets `leaderGap = 0`, so `topBoost` stays at 1:
  **no rubber band in either direction.** The skill value is the one number to tune by playing. For reference, the
  strongest rival in a normal 6-car race gets about 1.07 but is rubber-banded.
- Items are on for both racers.
- **AI driver specials are duel-only.** In every other race (campaign races 1–3 and quick race) the AI never fires
  its driver special; `AIState.special` is false by default and `makeRace` sets it true only for Mama Put here.
- 2 laps, first across the line wins. Ranking is `standings`. Results show once both are home, or 6 s after the
  first one finishes (laps mode waits the same 6 s after the *player* finishes).
- Placeholder lines, shown as a HUD message and on the intro and result cards: before the start, "Oga, you go pay for
  that jollof."; if she wins, "Shine your eye, small boy."; if you win, "Next time carry your own pot."

## Drivers and the unlock

Moshood and Mama Put, their specials, the garage picker, the HUD meter and the AI special logic all exist
(`src/config/drivers.ts`, `src/game/specials.ts`, `src/game/ai.ts`). The campaign adds only the lock.

- `DriverConfig` gets `locked?: { race: string }`. Mama Put has `locked: { race: 'campaign-1-4' }`.
- A driver is available if it has no lock, or the lock's race id is in `campaign.cleared`. There is no separate
  "unlocked drivers" list to fall out of sync: it is derived. A helper `driverAvailable(id, cleared)` is the single check.
- The Garage shows a locked driver with a lock and "Beat Mama Put in the campaign to unlock". The first time a duel
  win clears the lock, the results card says "Mama Put unlocked!" with a "Use her" button.
- In campaign races 1–3 rivals draw drivers from the available set minus `mamaput`. `randomDriver` takes an optional
  exclusion list for this. Quick race passes none.
- **Existing saves.** Mama Put is selectable today. After this change, a save that has her selected falls back to
  Moshood until race 4 is won. This is deliberate and is covered by a test.
- The `?unlock=all` reviewer shortcut also marks every campaign race cleared.

## Save and store

- `Saved` gets `campaign: { cleared: string[] }`. It is added in `normalise` with a default of `[]`, so the save key
  stays `lagos-racer:v2` and older saves load unchanged. Unknown ids in `cleared` are dropped; a saved `driver` that is
  still locked is replaced by the default driver.
- The store gets `spec: RaceSpec | null` (the race being run; `null` means quick race on the saved `track`) and
  `startRace(spec?)`. `setDriver` refuses a locked driver.
- `finishRace(results, place, bestLap)` takes the player's 1-based place. A pure `settle(spec, place, cleared)` (in
  `src/game/campaign.ts`, built on `evaluatePass(spec, ranking, playerId)` which returns `{ place, passed }`) works out
  the coins (place coins, plus the first-clear bonus when a spec is passed for the first time), the new `cleared`
  list, and any driver unlocked. The store saves them and exposes `outcome` to the Results screen (`null` for quick race).
- `Result` gets an optional `out` (seconds) for eliminated racers.
- `Hud` gets `mode` and `elimination: { left, total, timer, round } | null`.

## Setting up a race

`makeRace` moves from `RaceScene.tsx` to `src/game/setup.ts` (it needs no JSX, and this makes the grids unit-testable).
It takes a `RaceSetup` (`{ track, mode, excludeDrivers? }`, which a `RaceSpec` extends; quick race builds one from the
saved track) instead of a track id and builds the grid from it:

- laps and elimination: today's six-car grid (five rivals from `pickRivals`, the player last). Rival drivers come from
  `randomDriver` minus `excludeDrivers`.
- duel: two cars, front row, player on the right lane, Mama Put on the left, with her skill from the spec.

The runtime's `config` is the track config with `laps` overridden from the mode (the mode's lap count, or `Infinity`
for elimination), so `config.laps` stays the single source of truth for `updateProgress` and the HUD.

## UI

- **Menu.** A **Campaign** button next to the existing quick-race button (`OYA, RACE!`). The campaign is the larger
  of the two.
- **Campaign screen** (new `Screen` value `campaign`). A road map with four stops in order. Each stop shows its
  title, track, mode and state (locked, open, cleared). Tapping an open stop opens its **intro card**: the title, one
  line of story, the rule ("top 3 to move on", "last place is clamped every 20 s", "beat her to win"), and a Race button.
- **HUD.** Elimination replaces the lap counter with `n/6 left` and a countdown ring or number. A banner announces each
  knock-out. A short warning pulse in the last 3 s of the timer. On a phone the timer must fit in the top-centre
  progress line area without covering the minimap or the item button.
- **Results.** A Passed or Try again banner. Buttons: Next race, Retry, Campaign. Quick race keeps its current buttons.
  For elimination the table shows knock-out order and times. For the duel it shows the two racers and her line.
- **Story text** (placeholders):
  1. Ojuelegba Hustle: "Under the bridge, round the market. Finish top three to move on."
  2. Ikorodu Garage Run: "Danfos, oil drums and agberos at the motor park. Top three again."
  3. LASTMA Is Coming: "Every 20 seconds LASTMA clamps whoever is last. Do not be last."
  4. Mama Put's Challenge: "Mama Put has heard you are fast. One road, one pot, no mercy. Beat her and she rides with you."

## Files

| File | Change |
|---|---|
| `src/config/campaign.ts` (new) | `ModeSpec`, `RaceSetup`, `RaceSpec`, Chapter 1, story text, coin tables, first-clear bonus. |
| `src/game/campaign.ts` (new) + test | Pure rules: `evaluatePass`, `settle`, `campaignStatus`, `sanitizeCleared`, `driverAvailable`. |
| `src/game/modes.ts` (new) + test | `createMode`: `laps`, `elimination`, `duel`; `isIn`. Pure. |
| `src/game/setup.ts` (new) + test | `makeRace` moved out of `RaceScene.tsx`; six-car and duel grids. |
| `src/config/drivers.ts` | `locked` on Mama Put; `randomDriver` exclusion list. |
| `src/game/save.ts` | `campaign.cleared`, locked-driver fallback. |
| `src/game/store.ts` | `spec`, `startRace(spec?)`, `outcome`, `campaign`, HUD fields, `campaign` screen, `setDriver` guard. |
| `src/game/runtime.ts`, `src/game/race.ts` | `mode` and `spec` on `RaceRuntime`; `outAt` on `Racer`; `standings` accepts the narrower type. |
| `src/scene/RaceScene.tsx` | Takes the spec from the store; calls `makeRace` from `setup.ts`. |
| `src/scene/RaceLogic.tsx` | Call the mode; finish and results through it; eliminated racers brake; duel has no rubber band. |
| `src/game/ai.ts`, `items.ts`, `specials.ts`, `critters.ts` | Skip racers that are out. |
| `src/scene/Vehicle.tsx` | Disable an eliminated racer's body after the fade; clamp effect. |
| `src/ui/Menu.tsx`, `Campaign.tsx` (new), `Hud.tsx`, `Results.tsx`, `Garage.tsx`, `App.tsx`, `styles.css` | Screens above. |

## Testing

Unit tests (vitest), written first:

- **laps mode** reproduces the existing finish: player home, then all in or 6 s.
- **elimination:** interval for rounds 0, 1, 4, 5 and 9 (20, 18, 12, 10, 10); the last-placed racer is picked;
  tie-break; the race ends with one racer left; it ends when the player is out; ranking order; the timer does not
  advance outside `racing`.
- **duel:** two racers, first across wins; ranking.
- **`evaluatePass`:** place ≤ 3 and place = 1, for ranking with the player at each position.
- **Campaign order:** race N+1 is locked until N is cleared; `cleared` ids are sanitised.
- **Drivers:** `driverAvailable`; a save with `driver: 'mamaput'` and no clear falls back to Moshood; the same save
  with the duel cleared keeps her; `randomDriver` exclusion.
- **Save:** an old save with no `campaign` loads; junk `campaign` values load.

Not unit-testable, so checked by hand on a **mobile viewport** (as `CLAUDE.md` asks): the elimination HUD, the clamp
effect, the removed collider, and playing each race through. The duel's difficulty is judged by playing it several
times; the result is reported honestly rather than called balanced. The existing `?autopilot=1` mode lets the AI drive
the player's car, which is useful to watch the elimination timer without playing.

## Risks

- **Duel difficulty** depends on one number and on the AI being able to follow the racing line. It may need a better
  line, not just a higher skill.
- **Removing a car mid-race** in Rapier must not leave the vehicle's `body` in a state the frame loops trip over, and
  a body with its collider disabled has no mass. So the plan keeps the `racer.body` reference but disables the whole
  rigid body (`setEnabled(false)`) and drops its vehicle controller, after the 2 s fade. This is checked in the browser.
- **Multiplayer overlap.** The multiplayer plan (not started: there is no `server/` yet) also edits `makeRace`,
  `runtime.ts` and `RaceScene.tsx`. Moving `makeRace` to `setup.ts` is a pure move; whichever lands second reconciles.
- **Vehicle-upgrades overlap.** `2026-10-04-vehicle-upgrades.md` (not implemented) replaces the coin table with naira
  payouts and edits `save.ts`, `store.ts`, `RaceLogic.tsx`, `RaceScene.tsx`, `Results.tsx`, `Garage.tsx` and `Menu.tsx`.
  The campaign keeps its payout in one place (`coinsForPlace` over a table on the spec) so swapping in
  `payoutForPlace` later is one line, and both plans' `store.test.ts` must be merged by whoever lands second.
- **Elimination on an out-and-back road** needs the lap-free distance (`progress.distance`), which keeps increasing
  past one lap, so ordering stays correct. Checked on both tracks.
- **The first elimination at 20 s** may be harsh because the player starts at the back of the grid. The timer's
  start, step and floor are config values to tune by playing.

## Implementation order (for the plan)

1. Campaign data and rules (`config/campaign.ts`, `game/campaign.ts`), the driver lock and `randomDriver` exclusion.
2. `modes.ts`, with laps mode pinned to today's finish behaviour.
3. Save and store.
4. `makeRace` moves to `setup.ts`; `RaceLogic` goes through the mode; quick race plays exactly as before.
5. Duel: grid, AI settings, taunts.
6. Racers that are out are skipped everywhere (`isIn`).
7. Elimination in the scene: ticks, brake, disable, clamp effect, HUD, banner, results.
8. Campaign screen, intro cards, Results, Garage lock.
9. Full play-through on a mobile viewport; tune the duel; docs.
