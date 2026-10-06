# Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two boards (weekly points, best race time per track) fed by referee-validated Quick race finishes, keyed by nickname, shown through one small icon at the top right of the Multiplayer screen, and seeded with removable fake rows.

**Architecture:** Pure rules (keys, Lagos week, points, merge) live in `src/game/leaderboard.ts` so server and client share them. `Room` reports a finished Quick race's `referee.results()` through an `onResults` callback; `index.ts` wires that to a Postgres `LeaderboardStore` (same pattern as `PgPurchaseStore`). Two GET routes serve the boards with a 30 s cache; a React overlay reads them.

**Tech Stack:** TypeScript, Vitest, Node `http`, `pg`, React + zustand (existing `useNet` store), plain CSS in `src/styles.css`.

**Spec:** `docs/superpowers/specs/2026-10-06-leaderboard-design.md`

## Global Constraints

- Only Quick race (`room.quick === true`) records anything; friends' rooms never do.
- Never record a bot (the server's own `GridEntry.ai`, carried on `NetResult.ai` from the referee), a DNF, or a projected (unfinished) result.
- The recorded time is the referee's `NetResult.time` (seconds) as `time_ms = Math.round(time * 1000)`. Nothing is read from the phone.
- Player key = nickname trimmed, lower-cased, runs of whitespace collapsed to one space. Display name = the nickname as typed on the first recorded row.
- Week starts Monday 00:00 Lagos time (WAT, UTC+1, no DST). `week_start` is a `YYYY-MM-DD` date.
- Points by place: 1st 10, 2nd 7, 3rd 5, 4th 3, 5th 1, 6th 1, DNF 0; placeholders in `src/config/leaderboard.ts`.
- Boards show the top 50. A seeded row is hidden once a board holds 20 or more real rows. A real nickname equal to a seeded key removes the seed row.
- Responses are cached 30 s in memory. The client fetches once on open and does not poll.
- A leaderboard failure (Postgres down, bad row) is logged and swallowed; it must never delay or break a race result.
- UI: one small icon, top right of the Multiplayer main card, no visible text, `aria-label="Leaderboard"`, not shown on the friends form. Overlay uses the existing `.modal` / `.modal-card` pattern.
- Tables are created with `create table if not exists`, from `ensureSchema()`, like `gem_purchases`.
- Match the surrounding code: short comments that say why, no new dependencies.

## Review Focus

- A nickname that is only spaces or control characters (no usable key): the race result must still go out and nothing is recorded.
- Two humans in one race with the same nickname key: one entry per key per race, the better place, so points are not doubled.
- A very long or odd nickname (emoji, mixed case, double spaces): key is stable, display name capped by `NICK_MAX` via `cleanNick`.
- A slower time for a key that already has a faster one: the faster time stays.
- A race that ends across the Sunday/Monday boundary: points go to the week the race ended in, in Lagos time.
- `GET` with an unknown track id or no `name`: 200 with an empty board and no own row, never a 500.
- Postgres down at `record`: the race's `results` message is still sent to every racer.

---

### Task 1: Pure leaderboard rules

**Files:**
- Create: `src/config/leaderboard.ts`, `src/game/leaderboard.ts`
- Test: `src/game/leaderboard.test.ts`

**Interfaces:**
- Produces (`src/config/leaderboard.ts`): `POINTS_BY_PLACE: readonly number[]` (`[10,7,5,3,1,1]`), `BOARD_SIZE = 50`, `SEED_HIDE_AT = 20`, `CACHE_MS = 30_000`.
- Produces (`src/game/leaderboard.ts`):
  - `playerKey(name: string): string` (empty string when nothing usable remains)
  - `weekStart(ms: number): string`
  - `pointsFor(place: number): number`
  - `type Entry = { key: string; name: string; vehicle: VehicleId; timeMs: number; points: number }`
  - `entriesFromResults(results: NetResult[]): Entry[]` (skips `ai`, `dnf`, `projected`, `time === null`, empty key; one entry per key, the better place wins, points from `pointsFor(place)`)
  - `type Row = { key: string; name: string; value: number; vehicle?: VehicleId; seed: boolean }`
  - `mergeBoard(rows: Row[], order: 'asc' | 'desc', limit?: number): Row[]` (drops seed rows when real rows ≥ `SEED_HIDE_AT`, sorts by `value` per `order`, ties by input order, cuts to `limit` default `BOARD_SIZE`)

- [ ] **Step 1: Write the failing tests** in `src/game/leaderboard.test.ts`:
  - `playerKey('  Odogwu   RIDER ')` is `'odogwu rider'`; `playerKey('   ')` is `''`.
  - `weekStart` of `Date.UTC(2026, 9, 4, 23, 30)` (Sun 4 Oct 23:30 UTC = Mon 5 Oct 00:30 Lagos) is `'2026-10-05'`; of `Date.UTC(2026, 9, 4, 22, 30)` (Sun 23:30 Lagos) is `'2026-09-28'`.
  - `pointsFor(1)` is 10, `pointsFor(6)` is 1, `pointsFor(7)` is 0.
  - `entriesFromResults` skips a bot, a DNF, a `projected` result and a `time: null` result; converts `time: 83.4126` to `timeMs: 83413`; two results whose names key to the same string yield one entry with the better place's points.
  - `mergeBoard` with 19 real + 5 seeds keeps the seeds; with 20 real + 5 seeds drops them; `'asc'` sorts times low to high, `'desc'` sorts points high to low; result length never exceeds `limit`.
- [ ] **Step 2: Run** `npx vitest run src/game/leaderboard.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** both files to the signatures above. `weekStart`: shift `ms` by +1 h, take the UTC date, step back to Monday, format `YYYY-MM-DD`.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `git add src/config/leaderboard.ts src/game/leaderboard.ts src/game/leaderboard.test.ts && git commit -m "Leaderboard rules: nickname key, Lagos week, points, merge"`

---

### Task 2: Leaderboard store (memory and Postgres)

**Files:**
- Create: `server/leaderboard.ts`
- Test: `server/leaderboard.test.ts`

**Interfaces:**
- Consumes: `Entry`, `Row`, `weekStart` from `src/game/leaderboard.ts`.
- Produces (`server/leaderboard.ts`):
  - `interface LeaderboardStore { ensureSchema?(): Promise<void>; record(trackId: string, entries: Entry[], now: number): Promise<void>; weekly(week: string): Promise<Row[]>; times(trackId: string): Promise<Row[]>; seed(rows: SeedRow[]): Promise<void>; clearSeeds(): Promise<void> }`
  - `type SeedRow = { key: string; name: string; vehicle: VehicleId; trackId: string; timeMs: number; week: string; points: number }`
  - `class MemoryLeaderboardStore implements LeaderboardStore`
  - `class PgLeaderboardStore implements LeaderboardStore` (constructor `(pool: Pool)`)
- Semantics shared by both: `record` keeps the lower `timeMs` per `(key, trackId)` (name and vehicle follow the faster time), adds `points` to `(key, weekStart(now))`, and deletes any seed row with the same key first. `weekly(week)` returns `Row` with `value = points`; `times(trackId)` returns `Row` with `value = timeMs` and `vehicle`. Both return seed rows flagged `seed: true` and leave merging to the caller. `seed` writes rows with `is_seed = true`.
- Postgres tables exactly as in the spec: `best_times (player_key, name, track_id, time_ms, vehicle, set_at, is_seed, primary key (player_key, track_id))` and `weekly_points (player_key, name, week_start, points, updated_at, is_seed, primary key (player_key, week_start))`. `record` runs in one transaction (`pool.connect()`, `begin`/`commit`, `rollback` on error). Upsert with `on conflict ... do update set ... where excluded.time_ms < best_times.time_ms`.

- [ ] **Step 1: Write failing tests** in `server/leaderboard.test.ts`, run against `MemoryLeaderboardStore` through a shared `describe.each` so the Pg store can reuse them later:
  - second record with a slower time leaves the faster time; a faster one replaces it.
  - points add up within a week and are separate across weeks (`now` on either side of the Monday boundary).
  - `record` with a key equal to a seeded key removes the seed row from both tables.
  - `clearSeeds` removes only seed rows.
  - `times('unknown-track')` is `[]`.
- [ ] **Step 2: Run** `npx vitest run server/leaderboard.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `MemoryLeaderboardStore` with two Maps, then `PgLeaderboardStore` (SQL only; no live database in tests, matching `PgPurchaseStore`, which is untested against Postgres).
- [ ] **Step 4: Run** the same command — Expected: PASS. Also run `npx tsc --noEmit -p .` — Expected: no errors in `server/leaderboard.ts`.
- [ ] **Step 5: Commit** `git add server/leaderboard.ts server/leaderboard.test.ts && git commit -m "Leaderboard store: best times and weekly points, memory and Postgres"`

---

### Task 3: Record results from a finished Quick race

**Files:**
- Modify: `server/room.ts` (`RoomOptions` at line 46, constructor at 107, `endRace` at 506), `server/rooms.ts` (`RoomServer` constructor opts at 191, `newRoom` at 353), `server/index.ts`
- Test: `server/rooms.test.ts` (extend the existing `quick room` describe around line 1228)

**Interfaces:**
- Consumes: `LeaderboardStore`, `Entry`, `entriesFromResults` (Tasks 1–2).
- Produces:
  - `RoomOptions.onResults?: (trackId: string, results: NetResult[]) => void`, called from `endRace` after the results are sent, only when `this.quick` and `withResults`.
  - `RoomServer` opts gain `onQuickResults?: (trackId: string, results: NetResult[]) => void`, passed to quick rooms in `newRoom`.
  - In `index.ts`: a `leaderboard` holder (`let` store, null until `ensureSchema` resolves, same retry loop as `init`) and `onQuickResults` that, when the store is ready, calls `store.record(trackId, entriesFromResults(results), Date.now())` and catches/logs/`Sentry.captureException`s any rejection.

- [ ] **Step 1: Write failing tests** in `server/rooms.test.ts`:
  - a quick room that finishes a race calls `onResults` once with the track id and a `results` array equal to the one sent to racers;
  - a friends' room (`quick: false`) never calls it;
  - `onResults` throwing does not stop the `results` message reaching every racer (wrap the call in try/catch inside `endRace`).
  Reuse the existing helpers in that describe that drive a quick race to its end (see the tests near lines 1526 and 1574).
- [ ] **Step 2: Run** `npx vitest run server/rooms.test.ts -t "onResults"` — Expected: FAIL.
- [ ] **Step 3: Implement** the callback in `room.ts` (after the send loop in `endRace`, inside try/catch that `console.error`s) and thread `onQuickResults` through `RoomServer`. Wire `index.ts`: construct `new RoomServer({ onQuickResults })`; build `PgLeaderboardStore` from the existing `pg` pool and add its `ensureSchema()` to the `Promise.all` in `init`; log "leaderboard ready" with the saves line.
- [ ] **Step 4: Run** `npx vitest run server` — Expected: all server tests PASS.
- [ ] **Step 5: Commit** `git add server && git commit -m "Record Quick race finishes to the leaderboard store"`

---

### Task 4: Leaderboard HTTP routes

**Files:**
- Modify: `server/leaderboard.ts` (add handler), `server/index.ts` (route)
- Test: `server/leaderboard.test.ts` (extend)

**Interfaces:**
- Consumes: `LeaderboardStore`, `mergeBoard`, `playerKey`, `weekStart`, `CACHE_MS`, `BOARD_SIZE`, `TRACKS`.
- Produces: `type LeaderboardDeps = { store: LeaderboardStore | null; allowedOrigins: string[]; now?: () => number }` and `handleLeaderboardRequest(req: IncomingMessage, res: ServerResponse, deps: LeaderboardDeps): Promise<void>`.
- Routes (GET only, other methods 405, OPTIONS 204 with the same CORS headers as `handleSaveRequest`, no Authorization header needed):
  - `/leaderboard/weekly?name=` → `200 { week, rows: Row[], me: { rank: number, row: Row } | null, lastWinner: string | null }`
  - `/leaderboard/times?track=&name=` → `200 { track, rows: Row[], me: { rank, row } | null }`
  - Store null → 503. Unknown track → 200 with `rows: []`. `me` is the player's row with its rank in the full merged order (not only the top 50), or null.
- Cache: the merged board (before `me`) per `weekly:<week>` and `times:<track>` for `CACHE_MS`, using `deps.now`.

- [ ] **Step 1: Write failing tests** (a tiny request/response fake, or `http.createServer` on port 0, as `saves.test.ts` does):
  - weekly returns rows sorted by points, with `lastWinner` = top name of the previous week;
  - `name=` matching by key returns `me` with the right rank when the player is outside the top 50;
  - unknown track and missing `name` give 200, `rows: []`/no `me`;
  - store null gives 503; POST gives 405;
  - a second request within 30 s does not call the store again; after 30 s it does.
- [ ] **Step 2: Run** `npx vitest run server/leaderboard.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the handler; add `else if (path.startsWith('/leaderboard/'))` to `index.ts` beside `/pay/` with the same `.catch` logging pattern, `deps.store` set when the store becomes ready, `allowedOrigins` shared with `saveDeps`.
- [ ] **Step 4: Run** `npx vitest run server` — Expected: PASS.
- [ ] **Step 5: Commit** `git add server && git commit -m "Leaderboard routes: weekly points and per-track best times"`

---

### Task 5: Seeded players

**Files:**
- Create: `src/game/leaderboardSeeds.ts`, `scripts/seed-leaderboard.ts`
- Modify: `package.json` (script `"seed:leaderboard": "tsx scripts/seed-leaderboard.ts"`)
- Test: `src/game/leaderboardSeeds.test.ts`

**Interfaces:**
- Consumes: `SeedRow` (Task 2), `TRACKS`, `trackFor`, `VEHICLES`, `maxTopSpeed`, `weekStart`, `playerKey`.
- Produces: `makeSeeds(random: () => number, now: number, count?: number): SeedRow[]` (default `count` 40 distinct Naija-flavoured nicknames; each gets points for the current week and a time on every track).
- Time band per seed and track: `laps * length / (topSpeed * f)` where `f` is drawn from 0.55–0.85 and `topSpeed` is `maxTopSpeed` of the seed's vehicle. Every time must be at least the referee's floor `laps * length / (topSpeed * 1.6)` (spec: plausible, never faster than physics).
- Script: opens the pool from `DATABASE_URL`, calls `ensureSchema`, `clearSeeds()`, then `seed(makeSeeds(Math.random, Date.now()))`; `--clear` only clears. Prints how many rows it wrote.

- [ ] **Step 1: Write failing tests:** names are distinct by `playerKey` and each is valid under `cleanNick`; every time is ≥ the referee floor for its track and vehicle (`laps * length / (topSpeed * 1.6)`) and ≤ `laps * length / (topSpeed * 0.55)`; points are within 1–60; a fixed `random` gives identical output twice.
- [ ] **Step 2: Run** `npx vitest run src/game/leaderboardSeeds.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `makeSeeds` (nickname list inline in the file, 40+ entries) and the script.
- [ ] **Step 4: Run** the test — Expected: PASS. If a local `DATABASE_URL` exists, run `npm run seed:leaderboard` and then `npm run seed:leaderboard -- --clear`; otherwise note it was not run.
- [ ] **Step 5: Commit** `git add src/game/leaderboardSeeds.ts src/game/leaderboardSeeds.test.ts scripts/seed-leaderboard.ts package.json && git commit -m "Seeded leaderboard rows: generator and script"`

---

### Task 6: Leaderboard icon and overlay, plus docs

**Files:**
- Create: `src/ui/Leaderboard.tsx`, `src/net/leaderboard.ts`
- Modify: `src/ui/Online.tsx` (the Multiplayer main card at line 75), `src/styles.css`, `CLAUDE.md`
- Test: `src/net/leaderboard.test.ts`

**Interfaces:**
- Consumes: `syncBaseUrl` from `src/game/sync.ts`, `useNet` (`nickname`), `TRACKS`, `vehicleById`.
- Produces (`src/net/leaderboard.ts`):
  - `type Board = { rows: Row[]; me: { rank: number; row: Row } | null; week?: string; lastWinner?: string | null }`
  - `fetchWeekly(name: string, f?: typeof fetch): Promise<Board | null>`
  - `fetchTimes(track: string, name: string, f?: typeof fetch): Promise<Board | null>`
  - both return null on a non-200, a network error or malformed JSON, and send `name` through `encodeURIComponent`.
- Produces (`src/ui/Leaderboard.tsx`): `export function Leaderboard({ onClose }: { onClose: () => void })`: modal with tabs "This week" / "Best times", a track `<select>` on the second tab, rows (rank, name, points or `m:ss.mmm` plus vehicle name), the player's pinned row when `me.rank > 50`, "Last week: <name>" on the weekly tab, the empty text "Take a Quick play race to get on the board." and, on null, "Leaderboard no dey available now". Fetches once on open and on track change; no polling.
- `Online.tsx`: a button inside `.online-card`, shown only when `!friends`, with `aria-label="Leaderboard"` and `title="Leaderboard"`, containing only an inline trophy SVG; opens `<Leaderboard>`. CSS positions it absolutely at the card's top right (the card needs `position: relative`), about 36 px, min tap target 44 px on `@media (pointer: coarse)`.
- Docs: add one paragraph to `CLAUDE.md` after the Quick race paragraph: boards, Quick race only, nickname keys, seeding script and its removal, the files, and the spec and plan paths.

- [ ] **Step 1: Write failing tests** in `src/net/leaderboard.test.ts` with a fake `fetch`: URL contains the encoded name and track; a 200 body is returned as parsed; a 503, a thrown fetch and invalid JSON each give null.
- [ ] **Step 2: Run** `npx vitest run src/net/leaderboard.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the two fetch helpers, then the overlay and the icon button, then the CSS, then the `CLAUDE.md` paragraph.
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc --noEmit -p .` — Expected: all PASS, no type errors.
- [ ] **Step 5: Verify in the browser** with `preview_start` and the room server running locally (`npm run server` with no `DATABASE_URL` shows the 503 text; with a local database seeded, boards fill): open Multiplayer, confirm only a small icon appears top right with no text and does not shift the nickname field or buttons; open the overlay; check a 375×812 portrait phone viewport and a landscape one, and `.app[data-rotated]` mode; confirm no console errors.
- [ ] **Step 6: Commit** `git add src CLAUDE.md && git commit -m "Leaderboard icon and overlay on the Multiplayer screen"`

---

## Self-review notes

- Spec coverage: Quick-race-only recording (T3), referee time (T1/T3), nickname keys and limits (T1/T2), Lagos week (T1), points (T1), two boards and API with 30 s cache and `me` row (T4), seeds with hide-at-20 and replace-on-match (T1/T2/T5), icon-only UI and overlay states (T6), failure isolation (T3), tests listed in the spec (T1–T6).
- Type consistency: `Entry`, `Row`, `SeedRow`, `LeaderboardStore` are defined once (T1, T2) and used by name afterwards; `onResults` (Room) and `onQuickResults` (RoomServer) are distinct names for the two layers.
- Not planned, per spec: account linking, live rank after a race, per-vehicle boards, Gem rewards.
