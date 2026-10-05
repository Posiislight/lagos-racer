# Simpler menu, stars and the naira economy

Date: 5 October 2026. Status: your answers of 5 October are incorporated; awaiting final read-through. Follows the multiplayer and vehicle-upgrades merges (`main` at the merge of `worktree-vehicle-upgrades`).

## What we're doing and why

The game is nearly feature-complete for its first release but the front door is cluttered and the money doesn't hang together. This spec fixes both and adds the one thing mobile players need most, landscape play.

**What you asked for (4-5 October):**

1. Remove the "OYA, RACE!" quick race. The main menu has two entries: **Single player** (the campaign: pick one of four races and play it) and **Multiplayer** (race friends).
2. Stars per race by finishing place, and **stars decide what the race pays**.
3. A realistic, coherent naira system: payouts, unlock prices and upgrade prices fit together.
4. Force landscape on phones with a "rotate your phone" prompt.

**Assumptions I made (please correct any):**

- 3rd place = ★, 2nd = ★★, 1st = ★★★, 4th or lower = no stars and **no money**. (Confirmed.)
- A race pays the **same every time you replay it** (your choice, option c). There is no first-clear bonus. A star count is a *best*; payout always follows the stars you earn **in that run**.
- **Only the first race is open from the start.** Each next race opens when you pass the one before (top 3), and any open race can be replayed. The Mama Put duel unlocks her as a driver the first time you beat it. (Confirmed.)
- Garage and Settings stay reachable as two small icon buttons, not as menu "entries".

**Success looks like:** a new player opens the game, taps Single player, picks a race and is racing within two taps; every race result shows stars and a naira payout that obviously matches; a phone held upright never shows the game, only the rotate prompt.

**Out of scope (separate sub-projects):** accounts/Clerk, ads, real-money purchases, public matchmaking, new tracks. The design leaves seams for rewarded ads and a premium currency (see Seams).

## 1. Menu

`src/ui/Menu.tsx`

- Remove: "OYA, RACE!", the track-picker chips, the `launchRace()` quick path, and the store's use of `track` as a menu selection for single player (campaign races carry their own track; rooms carry theirs).
- Keep: **Single player** (`setScreen('campaign')`), **Multiplayer** (`setScreen('online')`), small Garage and Settings buttons, the OpenStreetMap credit, the naira balance.
- `launchRace` stays only as the helper the campaign and room flows call; `goFullscreen()` keeps firing from the tap that starts a race, since browsers require a user gesture.
- **Dependency (done):** the Grand Prix naming fix (`fix/grand-prix-names`) is merged into `main`, so this work builds on it.

## 2. Single player screen

`src/ui/Campaign.tsx`, `src/game/campaign.ts`

- Shows the four races as cards: title, track, mode, **stars earned (0-3 as ★/☆)** and the payout for each star level, so the reward is visible before you race.
- Race 1 is open; each later race stays `locked` until the one before it is passed, exactly as `campaignStatus` does today (no change to the gating). Locked cards show a padlock and "Pass the previous race". `nextRace` still drives the "Next race" button on the results screen.
- Mama Put's lock in the Garage is unchanged: she unlocks when `campaign-1-4` is first passed.

## 3. Stars

**Rule.** A race spec has a `stars` table by 1-based place, default `[3, 2, 1]` (4th and below: 0). The duel overrides it with `[3]` (win = ★★★, lose = 0, since there are only two places). Elimination and laps races use the default.

**Passing.** Passing a race means earning at least one star. That keeps the existing meaning of `pass.place` (3 for normal races, 1 for the duel) and is what unlocks drivers, so `cleared` stays as the derived "has ≥ 1 star".

**Save.** `campaign: { cleared: string[]; stars: Record<raceId, 0 | 1 | 2 | 3> }`, additive on the v2 save. `stars` holds the best ever. Migration: any id already in `cleared` with no `stars` entry gets 1 (they passed, we don't know how well). `sanitizeCleared` gains a `sanitizeStars` twin; unknown ids and bad values are dropped.

**Where it shows.** Results screen: stars earned this run, and "New best!" when this run beats the saved best. Campaign cards: best stars.

## 4. Money

Currency is naira (₦); the saved field keeps its old name `coins`.

### 4.1 Payouts (single player)

Paid **every time**, by the stars earned in that run:

| Result | Stars | Payout |
|---|---|---|
| 1st | ★★★ | ₦100,000 |
| 2nd | ★★ | ₦60,000 |
| 3rd | ★ | ₦30,000 |
| 4th or below | none | ₦0 |

Zero stars pays nothing (confirmed). It lives in `src/config/economy.ts` as `PAYOUT_BY_STARS = [0, 30_000, 60_000, 100_000]`.

### 4.2 What things cost (unchanged from the upgrades branch)

| Item | Price |
|---|---|
| Upgrade levels 1-5 (any stat, any vehicle) | ₦80k, 120k, 160k, 200k, 260k = ₦820k per stat, ₦2.46M per vehicle |
| BRT (the only locked vehicle) | ₦2M |
| Mama Put | free, unlocked by beating the duel |
| Paints | free (cosmetics for money come with the later shop) |

### 4.3 Pacing: how the numbers fit

Assume ~3 minutes a race and an average win-or-podium of about ₦65k (mixed 1st to 3rd).

| Goal | Cost | Races | Time |
|---|---|---|---|
| First upgrade (level 1) | ₦80k | ~1-2 | 5 min |
| Max one stat on one vehicle | ₦820k | ~13 | ~40 min |
| Unlock the BRT | ₦2M | ~30 | ~1.5 h |
| Max one vehicle | ₦2.46M | ~38 | ~2 h |
| Everything (4 vehicles maxed + BRT) | ₦11.8M | ~180 | ~9 h |

First upgrade within the first session, a real goal in the first week, a long tail for completionists. If playtesting says it's too slow or fast, change `PAYOUT_BY_STARS` only; everything else is priced against it. A test asserts these ratios hold, so a later price edit that breaks the pacing fails loudly.

### 4.4 Replays and farming

Because replays pay in full, the best race can be repeated for steady income. That is intended: it is the grind and the reason a rewarded "double payout" ad will later be worth watching. The only guard needed is to keep the daily total honest in multiplayer (below).

### 4.5 Multiplayer payouts

Room races pay by place, using the same table (1st ₦100k, 2nd ₦60k, 3rd ₦30k, 4th and below or DNF ₦0), but **at 50%** and with a **daily cap of ₦300,000** from rooms. Friends can otherwise take turns winning an empty room for unlimited money, and room results come from our own referee, not a trusted server of record. The cap is client-side until accounts exist (a reset save resets it); that is acceptable because rooms are private and the only thing at risk is a player's own progression.

### 4.6 Code changes

- `src/config/economy.ts`: replace `PAYOUTS`/`payoutForPlace` with `PAYOUT_BY_STARS`, `starsForPlace(spec, place)`, `payoutForStars(stars)`; add the room multiplier and cap constants.
- `src/config/campaign.ts`: drop `coins`, `firstClearCoins` and `QUICK_COINS`; add optional `stars` per spec.
- `src/game/campaign.ts`: `settle(spec, place, saved)` returns `{ stars, payout, newBest, passed, cleared, unlocked }`; `coinsForPlace` goes away. A quick race (no spec) no longer exists in single player.
- `src/game/race.ts` `coinsForPlace` and `src/net/results.ts` (`coinsFor`, `DNF_COINS`) switch to the economy table with the room multiplier.
- `src/game/store.ts` `finishRace`: pays `settle(...)`, records best stars, tracks the day's room earnings (`roomEarned: { day: 'YYYY-MM-DD'; naira: number }` in the save).
- `src/ui/Results.tsx`: shows stars, `+ ₦X`, and the breakdown line ("2nd place: ★★ = ₦60,000"). The existing "includes first-clear bonus" text goes.
- `?unlock=all` reviewer shortcut also fills all stars to 3.
- Old saves keep their naira balance as is. Balances were small (hundreds) under the old table; players start the new economy poor, which is true to the story. We do not convert them.

## 5. Landscape on phones

New `src/ui/RotatePrompt.tsx`, mounted once in `App.tsx`.

- Shows on `(pointer: coarse) and (orientation: portrait)` over **every screen** (menu, garage, results, race). A full-screen card: a phone icon that animates a rotation, "Turn your phone sideways to play", no buttons.
- Desktop and tablets in landscape never see it. Tablets in portrait do (the game is designed wide).
- **Mid-race rotation:** while the prompt is up during a race the game pauses (`setPaused(true)`), and stays paused when the phone is turned back so the player resumes deliberately. Online races can't pause the room: the race continues and the car idles, as it does for any backgrounded phone today.
- Best-effort lock: after the fullscreen request in `goFullscreen()`, `screen.orientation.lock('landscape')` is already attempted; Android Chrome obeys, iOS Safari ignores it, hence the prompt. The PWA manifest already says `orientation: landscape`.
- Cleanup: the `@media (max-width: 720px) and (orientation: portrait)` blocks in `src/styles.css` become dead code and are removed, with the menu laid out for landscape phones (about 640x360 and up) as the primary mobile layout.

## 6. Seams for later (not built now)

- Results carries `{ stars, payout, multiplier }`; a rewarded ad later sets `multiplier = 2` and the store pays `payout * multiplier`. Nothing else changes.
- A premium currency would be a second saved field and a second price column, never converted from naira. Not touched here.
- A "no forced ads" flag and cosmetics shop attach to accounts, after this.

## 7. Testing

- Unit: `starsForPlace` (default table, duel override, nonsense places), `payoutForStars`, `settle` (best stars only improve, payout follows this run's stars not the best, `cleared` derives from ≥ 1 star, duel unlock once), save migration (old `cleared` becomes 1 star; junk dropped), room multiplier and daily cap including the day rollover.
- Pacing test: first upgrade needs ≤ 2 average wins; one vehicle maxed needs between 25 and 50.
- UI: Menu has exactly two entry buttons; Campaign cards show best stars and reward ladder; Results shows stars and payout.
- Browser, on a phone viewport (375x812 portrait, then 812x375 landscape): the rotate prompt covers every screen in portrait and disappears in landscape; rotating mid-race pauses; a full single-player race pays the amount the results screen promised; the Garage balance matches. Check the layout at 640x360 as the smallest landscape size.

## 8. Risks

- **Existing players see their coin-unit balances look tiny** in the new scale. Mitigation: first upgrade is one decent race away.
- **Forcing landscape loses a few players who won't rotate.** Accepted: driving in portrait on a wide track is a worse game, and the prompt is one clear instruction.
- **iOS Safari can't lock orientation** and may show browser chrome in landscape. We rely on the prompt, not the lock.
- **The room daily cap is trusted from the client** until accounts. Fine for private rooms; revisit when public matchmaking exists.
