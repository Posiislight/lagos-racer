# Quick Race Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-button matchmaking with strangers: a public room waits 30 s, players vote on the track, disguised bots fill empty seats, and the race starts without a host.

**Architecture:** Quick rooms are the existing `Room` with a `quick` option. The server owns the timer, vote, bot roster and start. The real `ai` flag stays on the server; each phone gets a copy of the grid and results where `ai` is true only for cars it drives. If the phone driving the bots leaves, the bot cars move to the next connected human with an `adopt` message.

**Tech Stack:** TypeScript, Node `ws` room server (`server/`), vitest, React + zustand client, R3F/Rapier.

**Spec:** `docs/superpowers/specs/2026-10-05-quick-race-design.md`

## Global Constraints

- `QUICK_WAIT_MS = 30000`; early start at `MAX_HUMANS = 6` humans; grid size `GRID_SIZE = 6`.
- `MAX_QUICK_ROOMS = 50`; over the cap `quick` answers error `busy`.
- Bot lobby slots start at `BOT_SLOT_BASE = 7`; bots appear between 3 s and 26 s after the timer starts.
- Bot skill range 0.85–1.0 on the AI skill scale; bots never earn coins and never appear in a leaderboard.
- Quick rooms never use `AI_NAMES` (`src/game/names.ts`); they use the new `BOT_NAMES` pool of about 60 nicknames.
- The wire never marks a car as a bot except to the phone that drives it (spec, "Hiding the flag").
- Friends' rooms behave exactly as before; all existing tests pass unchanged.
- Nickname rules, rate limits, resume tokens and reconnect grace are unchanged.
- No real brand names in the nickname pool.
- Test on a mobile viewport as well as desktop (project CLAUDE.md).

## Review Focus

- A human joins a Quick room with 1 s left on the timer, or after the race has started: the first is seated and races, the second is placed in a new room (never `started`).
- A human's nickname equals a bot's name: the bot is renamed; two people never share a name.
- Everyone leaves during the wait while bots are showing: the room is reaped, bots never keep it alive or start a race alone.
- The bot driver leaves during `loading` or `countdown`, not just `racing`: bots still move to a connected human.
- A phone resumes after a handover: its re-sent grid shows the current owner, and it is re-sent `adopt` if it now drives bots.

---

### Task 1: Protocol additions

**Files:**
- Modify: `src/net/protocol.ts`
- Test: `src/net/protocol.test.ts`

**Interfaces:**
- Produces: constants `QUICK_WAIT_MS`, `MAX_QUICK_ROOMS`, `BOT_SLOT_BASE`; `ErrorCode` gains `'busy'`; `ClientMessage` gains `{ t: 'quick'; name: string; vehicle: VehicleId; paint: string }` and `{ t: 'vote'; trackId: string }`; `ServerMessage` gains `{ t: 'adopt'; netIds: number[] }`; `RoomView` gains `quick?: QuickView` with `export type QuickView = { startsInMs: number; votes: Record<string, number> }`.

- [ ] **Step 1: Write the failing test** in `protocol.test.ts`: `quick constants match the spec` asserting `QUICK_WAIT_MS === 30000`, `MAX_QUICK_ROOMS === 50`, `BOT_SLOT_BASE === 7`, and `BOT_SLOT_BASE > MAX_HUMANS`.
- [ ] **Step 2: Run** `npx vitest run src/net/protocol.test.ts`. Expected: FAIL (exports missing).
- [ ] **Step 3: Add the constants, the `busy` error code and the message and view types** above, in `protocol.ts`.
- [ ] **Step 4: Run** the test and `npx tsc --noEmit`. Expected: test passes. Type errors in `store.ts` (`ERROR_TEXT` is a `Record<NetError, string>`) are fixed in Task 7; for now add `busy: 'Server dey busy, try again'` to `ERROR_TEXT` in `src/net/store.ts` so the type check passes.
- [ ] **Step 5: Commit** `git add src/net/protocol.ts src/net/protocol.test.ts src/net/store.ts && git commit -m "Quick race: protocol types and constants"`

### Task 2: Bot roster

**Files:**
- Create: `server/bots.ts`
- Test: `server/bots.test.ts`

**Interfaces:**
- Produces:
  - `export const BOT_NAMES: readonly string[]` (about 60, all `cleanNick`-valid, none equal to an entry of `AI_NAMES`).
  - `export type BotView = { slot: number; name: string; vehicle: VehicleId; paint: string }`.
  - `export class Roster { constructor(random: () => number, startedAt: number); visible(now: number, humans: { name: string; vehicle: VehicleId; paint: string }[]): BotView[]; skills(): number[] }`.
  - `visible` returns at most `GRID_SIZE - humans.length` bots, those whose appearance time is `<= now`, with slots `BOT_SLOT_BASE + index`. Appearance times are drawn once in the constructor, uniform in `[3000, 26000]` ms after `startedAt`. A bot whose name equals a human's name (case-insensitive) gets the next unused pool name. `visible(Infinity, humans)` is the final grid fill: where a bot's `vehicle`+`paint` equals a human's, the paint changes to one on that vehicle no one on the grid uses (when one exists).
  - `skills()` returns one number per bot slot (5), each drawn once in the constructor from `[0.85, 1.0]`.

- [ ] **Step 1: Write failing tests** in `server/bots.test.ts` with a seeded `random`: `names are unique and never AI_NAMES`; `appearances fall in 3s..26s`; `no bots before 3 s, five at 26 s with zero humans`; `visible count shrinks to GRID_SIZE minus humans`; `a bot sharing a human's name is renamed`; `final fill avoids a human's exact vehicle and paint`; `skills are within 0.85 and 1.0`.
- [ ] **Step 2: Run** `npx vitest run server/bots.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `server/bots.ts`. Draw names by shuffling `BOT_NAMES` with `random`; paints per vehicle taken from `VEHICLES` in `src/config/vehicles.ts`.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `git add server/bots.ts server/bots.test.ts && git commit -m "Quick race: disguised bot roster"`

### Task 3: Quick room state (timer, vote, start)

**Files:**
- Modify: `server/room.ts`, `server/grid.ts`
- Test: `server/rooms.test.ts`, `server/grid.test.ts`

**Interfaces:**
- Consumes: Task 1 types, Task 2 `Roster`.
- Produces:
  - `Room` constructor gains a trailing options argument `{ quick?: boolean; random?: () => number; clock?: () => number }`; `readonly quick: boolean`; `trackId` becomes a mutable `string`.
  - `Room.vote(slot: number, trackId: string): boolean` (false if not quick, not lobby, or unknown track; replaces that slot's earlier vote).
  - `Room.tickQuick(now: number): void` (called from `Room.tick` while in lobby when quick): broadcasts the room when the visible bot count changes; when `now >= startsAt` or the room holds `MAX_HUMANS` humans, starts the race. Does nothing with no connected human.
  - `Room.view()` for a Quick room includes `quick: { startsInMs, votes }`, shows `Roster.visible(...)` bots as connected ready players after the humans, and reports `hostSlot: 0`.
  - `Room.size` and `isFull` keep counting humans only.
  - `buildQuickGrid(humans: { slot: number; name: string; vehicle: VehicleId; paint: string }[], bots: BotView[], ownerSlot: number): GridEntry[]` in `grid.ts`. Bots take the front places, owned by `ownerSlot`, with the real `ai: true`; humans follow in slot order with `ai: false`. `netId` is the grid index.
  - Quick start: winning track by votes (ties and zero votes random via `random`, among tied tracks or all `TRACKS`), sets `trackId`, builds the grid from `Roster.visible(Infinity, humans)`, owner is the lowest connected human slot, then proceeds exactly like `startRace` (referee, `gridMsg`, `loading`). Bot cars are not paid coins: results are unchanged (the client already pays only its own car).
  - The timer starts when the first human is added (`startsAt = now + QUICK_WAIT_MS`); later joins do not move it.
  - `lobby({ ready, fillAI })` in a Quick room: `ready` ignored, `fillAI` returns `'not-host'`; `startRace` returns `'not-host'`. All connected humans count as ready.

- [ ] **Step 1: Write failing tests** (fake clock, seeded random, existing `rooms.test.ts` helpers): `timer starts at the first human and a later join does not reset it`; `race starts at 30s with one human and five bots in the grid`; `sixth human starts it at once with no bots`; `most votes wins`; `tie and no votes pick from the right set`; `unknown track vote refused`; `vote ignored outside a quick lobby`; `quick room does not start with no connected human`; `start and fillAI refused with not-host`; `view shows bots only after their appearance time and hides one when a human takes the seat`. In `grid.test.ts`: `buildQuickGrid puts bots in front owned by the owner, ai true, humans after`.
- [ ] **Step 2: Run** `npx vitest run server/rooms.test.ts server/grid.test.ts`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** the interfaces above in `room.ts` and `grid.ts`. Friends' rooms keep their current code path untouched.
- [ ] **Step 4: Run** the same command plus `npx vitest run server`. Expected: all PASS.
- [ ] **Step 5: Commit** `git add server && git commit -m "Quick race: room timer, track vote, bot fill and auto-start"`

### Task 4: Matchmaking in RoomServer

**Files:**
- Modify: `server/rooms.ts`
- Test: `server/rooms.test.ts`

**Interfaces:**
- Consumes: Task 3 `Room` options and `Room.vote`.
- Produces: `parse` accepts `quick` (same checks as `create`) and `vote` (`trackId` a string of at most 40 characters). `RoomServer.quick(conn, c, name, vehicle, paint)` seats the player in the open Quick room in `lobby` phase with the least time left and a free human seat, else creates a Quick room, else (50 Quick rooms exist) sends `error: 'busy'`. A `vote` message from a seated connection calls `room.vote` and broadcasts the room on success.

- [ ] **Step 1: Write failing tests**: `quick creates a room for the first caller and joins the second to it`; `quick skips a full room and a started room`; `quick picks the room with least time left`; `busy at 50 quick rooms`; `a joiner after loading begins lands in a new room`; `bad nickname gives bad-name`; `vote message updates the tally for everyone`; `friends rooms never receive quick joiners`.
- [ ] **Step 2: Run** `npx vitest run server/rooms.test.ts`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** in `rooms.ts`: add `'quick'` and `'vote'` to the `Handled` union and `parse`, treat `quick` like `create`/`join` in `message()`, and route `vote` after the existing room lookup.
- [ ] **Step 4: Run** `npx vitest run server`. Expected: PASS.
- [ ] **Step 5: Commit** `git add server && git commit -m "Quick race: matchmaking message and vote routing"`

### Task 5: Hide the bot flag per recipient

**Files:**
- Modify: `server/room.ts`
- Test: `server/rooms.test.ts`

**Interfaces:**
- Consumes: Task 3 Quick grid.
- Produces: in Quick rooms the `grid` message and the `results` message are sent per recipient. `Room.gridFor(slot: number)` and `Room.resultsFor(slot: number)` return the message where each entry's `ai` is `true` only if the real flag is true and `entry.slot === slot`, else `false`. `resync` re-sends the filtered copy. Friends' rooms keep sending the real flags. The referee keeps the real grid.

- [ ] **Step 1: Write failing tests**: `owner sees ai true for bots only, others see all false`; `human cars are false for everyone`; `results are filtered the same way`; `resume re-sends a filtered grid`; `friends room grid still carries real ai flags`; `referee still treats bots as ai`.
- [ ] **Step 2: Run** `npx vitest run server/rooms.test.ts`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** by replacing the Quick-room `broadcast(this.gridMsg)` and results fan-out with a loop that sends `gridFor(slot)` / `resultsFor(slot)` to each connected grid human (find slot through the members map).
- [ ] **Step 4: Run** `npx vitest run server`. Expected: PASS.
- [ ] **Step 5: Commit** `git add server && git commit -m "Quick race: hide bot flag from everyone but the driving phone"`

### Task 6: Bot ownership handover

**Files:**
- Modify: `server/room.ts`
- Test: `server/rooms.test.ts`

**Interfaces:**
- Consumes: Task 5 `gridFor`.
- Produces: `Room.dropOut(slot)` in Quick rooms: if the leaver owns bot cars, those cars are reassigned (their grid `slot` set to) the lowest connected human other than the leaver, who is sent `{ t: 'adopt', netIds }`, and the bot cars are not marked DNF; only the leaver's human car is. With no connected human left the existing "everyone gone" path ends the race. `Room.resync(slot)` re-sends `adopt` if that slot now owns bots. Works in `loading`, `countdown` and `racing` (during `loading`/`countdown` the grid message is re-sent to the new owner, filtered).

- [ ] **Step 1: Write failing tests**: `owner leaving mid-race hands bots to the next human and sends adopt`; `leaver's own car is DNF but bots are not`; `snapshots for adopted cars are accepted from the new owner and refused from the old`; `grace expiry also hands over`; `handover during loading and countdown`; `no human left ends the race`; `resume after handover gets a grid with the current owner and the adopt`; `friends rooms still DNF the host's AI`.
- [ ] **Step 2: Run** `npx vitest run server/rooms.test.ts`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** in `Room.dropOut`; `owns()` already reads the grid, so mutating bot entries' `slot` updates it.
- [ ] **Step 4: Run** `npx vitest run server`. Expected: PASS.
- [ ] **Step 5: Commit** `git add server && git commit -m "Quick race: hand bots to the next human when their phone leaves"`

### Task 7: Client store, Online and Lobby screens

**Files:**
- Modify: `src/net/store.ts`, `src/ui/Online.tsx`, `src/ui/Lobby.tsx`, `src/App.tsx` (only if screen routing needs it), `src/ui/Menu.tsx` (Quick race entry)
- Test: `src/net/session.test.ts` or a new `src/net/store.test.ts` following `session.test.ts` style

**Interfaces:**
- Consumes: Task 1 protocol, `Connection` mock style in `src/net/connection.test.ts`.
- Produces: `useNet` gains `quick: (name: string, vehicle: VehicleId, paint: string) => void` (opens a socket and sends `{ t: 'quick', ... }`) and `vote: (trackId: string) => void`. `room.quick` exposes `startsInMs`; the Lobby counts down locally from the moment each room message arrived. Lobby for a Quick room shows "Looking for racers…", the countdown, one button per track with its vote count, no Start, no Ready, no code, no share link. Online screen shows a Quick race button above Create room, using the same nickname field.

- [ ] **Step 1: Write failing tests** for the store: `quick opens a socket and sends the quick message with the nickname`; `bad nickname sets bad-name and sends nothing`; `vote sends the vote message`; `busy error shows the busy text and stays on the online screen`.
- [ ] **Step 2: Run** `npx vitest run src/net`. Expected: FAIL.
- [ ] **Step 3: Implement** store actions and the UI. Add a short test or story-style check that a Quick `RoomView` renders no Start button (component test only if the repo has an existing pattern; otherwise verify in Step 5).
- [ ] **Step 4: Run** `npx vitest run src/net` and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Verify on a phone-sized viewport** with the dev server: Quick race → lobby shows countdown and votes, bots appear over time, and the race starts at 30 s. Capture a screenshot.
- [ ] **Step 6: Commit** `git add src && git commit -m "Quick race: client entry, lobby and track vote"`

### Task 8: Adopt on the client and human-like bot driving

**Files:**
- Modify: `src/net/session.ts`, `src/net/store.ts` (route `adopt`), `src/game/setup.ts`, `src/game/ai.ts`, `src/game/runtime.ts` (if `Racer.kind` needs a transition helper)
- Test: `src/net/session.test.ts`, `src/game/ai.test.ts` (create if absent)

**Interfaces:**
- Consumes: Task 6 `adopt` message.
- Produces:
  - `NetSession.adopt(netIds: number[]): void` converts each named remote car in the attached race to `kind: 'ai'` driven by this phone: its body is positioned from the car's latest interpolated pose and velocity, `r.remote` is cleared, `r.owner` becomes `setup.mySlot`, `r.ai = rivalAI(...)` with a skill in `[0.85, 1.0]` drawn with `Math.random`. If the race is not attached yet, the ids are kept and applied in `attach`.
  - A new exported function in `ai.ts`: `humanize(r: Racer, dt: number, race: RaceRuntime): void`, called after `driveAI` for cars that are bots in Quick rooms. Quick rooms set `race.mode`-independent flag `race.humanize: boolean` from `OnlineSetup`.
  - Bounds the tests pin: green-light delay 0–0.4 s; lane wobble at most 0.15 of track half-width; mistake at most once per 25 s per car lasting at most 0.6 s; power-up hold between 0.5 and 3 s before use.
  - `OnlineSetup` gains `quick: boolean` (set from the room's `RoomView.quick` presence).

- [ ] **Step 1: Write failing tests**: `adopt turns a remote car into a locally driven ai car at its last pose`; `adopt before attach applies on attach`; `adopted car's snapshots are now sent by this phone`; `humanize keeps start delay, wobble, mistake and hold within bounds` using seeded `Math.random`.
- [ ] **Step 2: Run** `npx vitest run src/net/session.test.ts src/game/ai.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Inspect `src/scene/Vehicle.tsx` first to see how remote cars get a kinematic body versus an AI car's dynamic body; the conversion must switch the body type, not rebuild the visual.
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `git add src && git commit -m "Quick race: adopt dropped bots and drive them like people"`

### Task 9: Race again, docs and end-to-end check

**Files:**
- Modify: `src/ui/Results.tsx`, `src/game/store.ts` (only if the online results flow needs a hook), `CLAUDE.md`
- Test: `src/net/store.test.ts`

**Interfaces:**
- Consumes: Tasks 7 and 8.
- Produces: after a Quick race, the results screen offers "Race again", which leaves the room and runs `useNet.quick(...)` again with the saved nickname, vehicle and paint; Menu leaves. CLAUDE.md: Quick race becomes part of the multiplayer milestone (spec and plan paths), and says bots are disguised and silent.

- [ ] **Step 1: Write failing test**: `race again leaves the room and sends a fresh quick message`.
- [ ] **Step 2: Run** `npx vitest run src/net/store.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the button and the CLAUDE.md edit.
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc --noEmit`. Expected: all PASS.
- [ ] **Step 5: End-to-end check:** run the room server and two browser tabs (phone-sized). Race to the end with one human plus bots; confirm only the driving tab's devtools show any `ai: true`. Close the driving tab mid-race and confirm the bots keep racing in the second tab. Repeat with `?lag=` simulation (see `parseLagSim`). Record what you saw.
- [ ] **Step 6: Commit** `git add CLAUDE.md src && git commit -m "Quick race: race again, docs"`

---

## Self-review

- **Spec coverage:** flow (Tasks 3, 4, 7), vote (3, 4, 7), bots and arrival and skill (2, 3), hiding the flag (5), handover (6), client adopt and human-like driving (8), race again (9), room cap and `busy` (4), edge cases (Review Focus tests in Tasks 3–6), testing section (each task's tests, Task 9 end-to-end). Spec open items (nickname list, tuning, arrival shape) are decided in Tasks 2 and 8; arrival is uniform.
- **Not in this plan:** voice chat (own spec), a leaderboard, disclosure text.
- **Type consistency:** `Roster`, `BotView`, `QuickView`, `buildQuickGrid`, `Room.vote`, `Room.gridFor/resultsFor`, `NetSession.adopt`, `useNet.quick/vote` are used under the same names throughout.
- **Known risk:** Task 8 depends on how remote and AI cars differ in `Vehicle.tsx`; the implementer reads it first, and if the body type cannot be switched live, raise it before continuing.
