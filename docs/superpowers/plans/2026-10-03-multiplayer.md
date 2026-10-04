# Multiplayer (Friends' Private Rooms) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2–6 friends race live on Ojuelegba from their own phones, joined by a room code or link, with optional AI fill.

**Architecture:**
- Each phone simulates the cars it owns (its human car, plus AI cars if it is the host) with the existing Rapier code.
- It streams 15 Hz binary snapshots through a small Node WebSocket server.
- Other phones replay those cars as kinematic bodies, interpolated from a snapshot buffer.
- The server only handles rooms, relays messages, syncs the clock, and referees laps and results.
- Items are events, and the victim's phone decides whether it was hit.

**Tech Stack:**
- Client: Vite, React 19, TypeScript, React Three Fiber, @react-three/rapier, zustand.
- Server: Node 24 with `ws`, run by `tsx`.
- Tests: vitest.

**Spec:** `docs/superpowers/specs/2026-10-03-multiplayer-design.md` (read it first; this plan argues from it).

## Depends on the Ojuelegba Road work

`docs/superpowers/specs/2026-10-03-ojuelegba-road-track-design.md`, from a parallel session, changes things this
plan touches. Execute this plan after that work lands, and check these points against the merged code:

- **Four vehicles with paint.** `VehicleId` becomes `okada | keke | danfo | brt`. Add `paint` (whatever type
  that work defines) next to `vehicle` in `PlayerInfo`, `GridEntry`, `NetResult` and the `lobby` / `create` /
  `join` messages, and pass it into `makeRace`. With six grid slots and four vehicles, AI vehicles repeat;
  `buildGrid` gives a repeated AI vehicle a different paint.
- **Out-and-back track with a median.** `trackRemote` (Task 10) and `Referee.observe` (Task 14) must
  project using the same leg-aware rule as `updateProgress`, so a remote car is never snapped onto the
  other leg. Add one test for each, at a point where the two legs run side by side.
- **Bump shove.** This stays local to each car, as this plan assumes. No change is needed, but recheck
  Task 12's bump test in the browser.

## Global Constraints

- Single-player must behave exactly as before. When `race.net` is null, every changed function takes its old path, and `npm test` stays green after every task.
- Snapshot rate: `TICK_HZ = 15`.
- Interpolation buffer: 0.1–0.25 s on top of the measured network delay. Extrapolate for at most 0.25 s, then hold.
- Reconnect grace: `RECONNECT_GRACE_MS = 15000`. Client backoff is 500, 1000, 2000, 4000 ms, then 4000 ms repeated, until the grace period runs out.
- Server timers:
  - room idle expiry `ROOM_IDLE_MS = 600000`;
  - loading timeout `LOAD_TIMEOUT_MS = 20000`;
  - start lead `START_LEAD_MS = 3500`;
  - finish cutoff `FINISH_CUTOFF_MS = 30000`.
- Room size: `MAX_HUMANS = 6`, `GRID_SIZE = 6`.
- Room codes: 4 letters from `ABCDEFGHJKLMNPQRSTUVWXYZ` (no I or O). Typed codes are trimmed and upper-cased.
- Nicknames: 1–16 characters after trimming, with control characters removed.
- Server limits: `MAX_MESSAGE_BYTES = 4096`, `RATE_LIMIT_PER_S = 30` messages per connection.
- Referee:
  - finish distance must be at least `laps × track.length − 30` m;
  - every lap must be at least `track.length / (maxTopSpeed × 1.6)` s, where `maxTopSpeed` is the vehicle's top speed with all upgrades at level 5 (`applyUpgrades(base, { engine: 5, tyres: 5, body: 5 }).tuning.topSpeed`);
  - the lap times must sum to the finish time within 0.5 s.
- Coins by place: `[150, 100, 60, 30]`, then 20.
- Player-facing copy (verbatim):
  - "Race with friends", "Create room", "Join room", "Share", "Ready", "Fill with AI", "Start", "Leave race";
  - errors: "Room not found", "Room full", "Race don start already", "Network wahala" (DNF label), "Connection don cut".
- Dev URLs: the client connects to `import.meta.env.VITE_ROOM_SERVER`, falling back to `` `ws://${location.hostname}:8787` `` so phones on the same Wi-Fi reach a laptop's server.
- Code style: small focused files, sparse comments in the existing voice, and zustand for UI state. No new runtime dependencies other than `ws` and `tsx`.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- After UI tasks, verify at the mobile preset (375×812, landscape where the game forces it), not only on desktop.

## Review Focus

These are failure modes the spec implies that no feature test would naturally cover. Each one has a test in the task named.

1. **Phone backgrounded mid-race** (switching to WhatsApp and back). Expect no burst of queued snapshots, the race clock jumping straight to server time, and no double-counted lap. Test in Task 10.
2. **Two friends with the same nickname and vehicle.** Results must mark only *my* car as mine, by slot, never by name. Test in Task 14.
3. **Host taps Start while a player is reconnecting.** Expect that player left out of the grid; when they come back they see the room in "racing" and wait for the rematch, and nothing crashes. Tests in Tasks 4 and 16.
4. **Late snapshots from the previous race arriving after a rematch starts.** They must be dropped by the server and the client (`raceSeq` mismatch). Tests in Tasks 9 and 10.
5. **Code typed as " keke " or a link with `?room=keke`.** It must join room `KEKE`. Test in Task 3.

---

## Phase 1: Server, lobby and synced countdown

### Task 1: Protocol: shared types, constants and binary snapshots

**Files:**
- Create: `src/net/protocol.ts`
- Test: `src/net/protocol.test.ts`

**Interfaces:**
- Produces:
  - all the constants in Global Constraints, exported by those exact names;
  - `CODE_ALPHABET`, `NICK_MAX = 16`;
  - `FLAG = { boost: 1, slip: 2, curse: 4, wobble: 8, horn: 16, finished: 32 } as const`;
  - `type RoomPhase = 'lobby' | 'loading' | 'countdown' | 'racing'`;
  - `type ErrorCode = 'not-found' | 'full' | 'started' | 'bad-name' | 'bad-code' | 'expired' | 'not-host' | 'not-ready'`;
  - `type PlayerInfo = { slot: number; name: string; vehicle: VehicleId; ready: boolean; connected: boolean }`;
  - `type RoomView = { code: string; phase: RoomPhase; hostSlot: number; fillAI: boolean; raceSeq: number; players: PlayerInfo[] }`;
  - `type GridEntry = { netId: number; slot: number; name: string; vehicle: VehicleId; ai: boolean }` (`slot` is the owning human's slot; `netId` is the grid index, front to back);
  - `type NetResult = { netId: number; slot: number; ai: boolean; name: string; vehicle: VehicleId; place: number; time: number | null; projected: boolean; best: number | null; dnf: boolean }`;
  - `type ClientMessage` and `type ServerMessage`: the discriminated unions on `t` listed below;
  - `type CarState = { netId: number; x: number; y: number; z: number; qx: number; qy: number; qz: number; qw: number; vx: number; vy: number; vz: number; distance: number; laps: number; flags: number }`;
  - `type Snapshot = { slot: number; raceSeq: number; time: number; cars: CarState[] }`;
  - `encodeSnapshot(s: Snapshot): ArrayBuffer`;
  - `decodeSnapshot(buf: ArrayBuffer): Snapshot | null`;
  - `normalizeCode(raw: string): string` (trim + upper-case);
  - `cleanNick(raw: string): string | null`.

ClientMessage:
- `{t:'create', name, vehicle}`, `{t:'join', code, name, vehicle}`, `{t:'resume', token}`
- `{t:'ping', c}`
- `{t:'lobby', vehicle?, ready?, fillAI?}`, `{t:'start'}`, `{t:'loaded'}`
- `{t:'pickup', orb}`, `{t:'use', hazard: Hazard}`, `{t:'hit', hazard: number, netId}`
- `{t:'finish', netId, laps: number[], time}`
- `{t:'leave'}`

ServerMessage:
- `{t:'welcome', code, slot, token}`, `{t:'room', room: RoomView}`, `{t:'error', error: ErrorCode}`
- `{t:'pong', c, s}` (where `s` is the server's `Date.now()`)
- `{t:'grid', raceSeq, grid: GridEntry[], seed, trackId, laps}`, `{t:'start', raceSeq, at}`
- `{t:'pickup', orb, from}`, `{t:'use', hazard: Hazard, from}`, `{t:'hit', hazard, netId, from}`
- `{t:'finished', netId, time}`, `{t:'dnf', netIds: number[]}`
- `{t:'results', raceSeq, results: NetResult[]}`

`Hazard` is a type-only import from `src/game/runtime.ts`.

Binary layout, little-endian:
- header, 8 bytes: u8 version (=1), u8 slot, u8 raceSeq (mod 256), u8 car count, f32 time;
- per car, 33 bytes: u8 netId, f32 x, y, z, i16 quaternion ×4 (scaled by 32767), i16 velocity ×3 (cm/s, clamped to the i16 range), f32 distance, u8 laps, u8 flags.

- [ ] **Step 1: Write the failing tests**

```ts
it('round-trips a two-car snapshot within quantisation error', () => {
  // cars: {netId:3, x:12.5, y:1.25, z:-40, q = yaw 30° unit quaternion, vx:31.4, vy:-0.5, vz:-12.2, distance:812.75, laps:1, flags: FLAG.boost|FLAG.horn}, plus a second car
  const out = decodeSnapshot(encodeSnapshot(s))!;
  expect(out.slot).toBe(2); expect(out.raceSeq).toBe(7); expect(out.time).toBeCloseTo(41.5, 4);
  expect(out.cars[0].x).toBeCloseTo(12.5, 4);
  expect(out.cars[0].qy).toBeCloseTo(s.cars[0].qy, 4);
  expect(out.cars[0].vx).toBeCloseTo(31.4, 2);
  expect(out.cars[0].flags).toBe(FLAG.boost | FLAG.horn);
  expect(encodeSnapshot(s).byteLength).toBe(8 + 2 * 33);
});
it('rejects a wrong version or a truncated buffer', () => { /* decodeSnapshot(...) === null for both */ });
it('wraps raceSeq above 255', () => { /* raceSeq 257 decodes as 1 */ });
it('normalizes " keke " to "KEKE"', () => expect(normalizeCode(' keke ')).toBe('KEKE'));
it('cleans nicknames', () => {
  expect(cleanNick('  Tunde  ')).toBe('Tunde');
  expect(cleanNick('a\u0007b')).toBe('ab');
  expect(cleanNick('   ')).toBeNull();
  expect(cleanNick('x'.repeat(30))).toHaveLength(16);
});
```

- [ ] **Step 2:** Run `npx vitest run src/net/protocol.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement `src/net/protocol.ts` per the Interfaces above, using a `DataView`.
- [ ] **Step 4:** Run `npx vitest run src/net/protocol.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `git add src/net && git commit -m "net: shared protocol and binary snapshots"`.

### Task 2: Clock sync

**Files:**
- Create: `src/net/clock.ts`
- Test: `src/net/clock.test.ts`

**Interfaces:**
- Produces: `class ClockSync`, with:
  - `addSample(sentAt: number, serverTime: number, receivedAt: number): void` (client times come from `performance.now()`);
  - `get offset(): number` (`serverTime − client midpoint`, taken from the lowest-RTT sample of the last 8);
  - `get rtt(): number`;
  - `get synced(): boolean` (at least one sample);
  - `serverNow(clientNow?: number): number`.

- [ ] **Step 1: Write the failing tests**

```ts
it('uses the lowest-latency sample', () => {
  const c = new ClockSync();
  c.addSample(1000, 50_000, 1300);   // rtt 300, offset 48_850
  c.addSample(2000, 51_060, 2080);   // rtt 80, offset 49_020
  expect(c.rtt).toBe(80); expect(c.offset).toBe(49_020);
  expect(c.serverNow(3000)).toBe(52_020);
});
it('forgets samples older than the last 8', () => { /* 1 fast sample then 8 slow ones -> rtt is the slow one */ });
it('is not synced before any sample', () => expect(new ClockSync().synced).toBe(false));
```

- [ ] **Step 2:** Run `npx vitest run src/net/clock.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `ClockSync`.
- [ ] **Step 4:** Run `npx vitest run src/net/clock.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `net: clock sync`.

### Task 3: Room server: connections, create, join, resume, leave, limits

**Files:**
- Create:
  - `server/rooms.ts` (`RoomServer`: connections, routing, codes, tokens, limits);
  - `server/room.ts` (`Room`: members, host, lobby state, broadcasting);
  - `server/tsconfig.json`.
- Modify:
  - `package.json`: add deps `ws` and `tsx`, devDeps `@types/ws` and `@types/node`, and scripts `"server": "tsx server/index.ts"`, `"start": "tsx server/index.ts"`, `"typecheck": "tsc -p . && tsc -p server"`.
- Test: `server/rooms.test.ts`.

**Interfaces:**
- Consumes: everything from Task 1.
- Produces:
  - `interface Peer { send(data: string | ArrayBuffer): void; close(): void }`;
  - `class RoomServer`:
    - `constructor(opts?: { now?: () => number; random?: () => number; trackId?: string })`;
    - `open(peer: Peer): number`;
    - `message(conn: number, data: string | ArrayBuffer): void`;
    - `close(conn: number): void`;
    - `tick(): void`;
    - `readonly rooms: Map<string, Room>`.
  - Tests and `server/index.ts` use only these.
  - `server/tsconfig.json`: `lib ["ES2022","DOM"]`, `types ["node"]`, `moduleResolution "bundler"`, `noEmit`, and `include ["./**/*.ts", "../src/net/protocol.ts"]`. DOM is needed because the shared track and vehicle files transitively reference DOM types.

Behaviour:
- **create:** cleans the nick; picks an unused code with `random()`; slot 1; sends `welcome` with a random 24-character token, then a `room` view.
- **join:**
  - unknown code → `error not-found`;
  - 6 humans already → `full`;
  - phase is not `lobby` → `started`.
  - Slots are the lowest free number from 1 to 6.
- **resume:**
  - a token found in any room re-binds that member's `conn`, sets `connected` back, and sends `welcome` and `room`;
  - an unknown token → `expired`.
- **leave or close:**
  - explicit `leave` removes the member at once;
  - `close` marks them disconnected (`leftAt = now`) and keeps the slot until `tick()` sees `RECONNECT_GRACE_MS` pass;
  - if the host goes, `hostSlot` becomes the lowest connected slot;
  - a room with no members is deleted.
- **lobby:** sets vehicle and ready; `fillAI` only from the host, otherwise `not-host`. Every change broadcasts `room` to all connected members.
- **ping:** replies `pong {c, s: now()}`.
- **Limits:**
  - over 4096 bytes, or more than 30 messages in any 1 s window → dropped silently;
  - JSON that doesn't parse or match a known `t` → dropped.
- **Idle expiry:** `tick()` deletes rooms with no message for `ROOM_IDLE_MS`.

- [ ] **Step 1: Write the failing tests** (`FakePeer` records `sent`; `now` is a mutable number; helper `msgs(peer, t)` parses JSON messages of type `t`)

```ts
it('creates a room with a 4-letter code and makes the creator host in slot 1')
  // welcome.code matches /^[A-HJ-NP-Z]{4}$/, welcome.slot === 1, room.hostSlot === 1
it('joins by code case- and space-insensitively')          // join code ' abcd ' for room ABCD succeeds
it('rejects unknown codes, a 7th human, and joins after the race started')
  // errors: 'not-found', 'full', 'started'
it('rejects blank nicknames with bad-name')
it('resumes a dropped player into the same slot with their token')
it('frees the slot after 15 s without a resume and hands host to the lowest slot')
  // now += 15_001; tick(); room.players has no slot 1; hostSlot === 2
it('only the host can toggle fillAI')                       // non-host gets 'not-host'
it('drops messages over 4096 bytes and beyond 30 per second')
  // 40 pings in the same ms -> 30 pongs
it('deletes a room idle for 10 minutes and when its last member leaves')
it('answers ping with the client time and server time')     // pong.c === 123, pong.s === now
```

- [ ] **Step 2:** Run `npm i ws tsx && npm i -D @types/ws @types/node`, then `npx vitest run server/rooms.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `server/room.ts` and `server/rooms.ts`.
- [ ] **Step 4:** Run `npx vitest run server/rooms.test.ts && npx tsc -p server`. Expected: PASS, with no type errors.
- [ ] **Step 5:** Commit: `server: rooms, lobby, resume and limits`.

### Task 4: Room server: start, grid, loading and countdown

**Files:**
- Create: `server/grid.ts`.
- Modify: `server/room.ts`.
- Test: `server/grid.test.ts`; extend `server/rooms.test.ts`.

**Interfaces:**
- Consumes: Task 3 `Room` and `RoomServer`.
- Produces: `buildGrid(members: { slot: number; name: string; vehicle: VehicleId }[]): GridEntry[]`. This is humans only, in slot order, with `netId` = index and `ai: false`. Task 15 extends it.

Behaviour:
- **`start`:**
  - only from the host (`not-host` otherwise);
  - needs at least 2 connected humans, all connected ones ready (`not-ready` otherwise). Members who are disconnected but still in their grace period are left out of the grid.
  - It increments `raceSeq`, draws `seed = floor(random() × 2³²)`, sets phase `loading`, and broadcasts `grid {raceSeq, grid, seed, trackId:'ojuelegba', laps: trackById('ojuelegba').laps}`.
- **`loaded`:**
  - once every grid human is loaded or connected-and-loaded, or `LOAD_TIMEOUT_MS` passes since `grid` (checked in `tick()`), set `startAt = now + START_LEAD_MS`, phase `countdown`, and broadcast `start {raceSeq, at}`;
  - in `tick()`, `now ≥ startAt` → phase `racing`.

- [ ] **Step 1: Write the failing tests**

```ts
// grid.test.ts
it('orders humans by slot and numbers netIds from 0')
// rooms.test.ts
it('start needs the host, two humans and everyone ready')     // errors 'not-host', 'not-ready'
it('broadcasts grid with a new raceSeq and seed, and phase loading')
it('sends start 3.5 s ahead once everyone has loaded')        // start.at === now + 3500
it('sends start after 20 s even if someone never loads')
it('leaves a reconnecting player out of the grid')            // Review Focus 3
it('moves to racing when the start time passes')
```

- [ ] **Step 2:** Run `npx vitest run server`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx vitest run server && npx tsc -p server`. Expected: PASS.
- [ ] **Step 5:** Commit: `server: race start, grid and synced countdown`.

### Task 5: Server entry point and local run

**Files:**
- Create: `server/index.ts`.
- Modify:
  - `.claude/launch.json`: add `{"name":"room-server","runtimeExecutable":"npm","runtimeArgs":["run","server"],"port":8787}`;
  - `README.md`: a "Multiplayer (local)" section with `npm run server` and how phones on the same Wi-Fi connect.

**Interfaces:**
- Consumes: `RoomServer` (Task 3).
- Produces: an HTTP server on `process.env.PORT ?? 8787`:
  - `GET /health` returns `200 ok`;
  - a `WebSocketServer({ server, maxPayload: MAX_MESSAGE_BYTES })` whose binary frames are converted from Buffer to an exact-length `ArrayBuffer`;
  - `setInterval(() => rooms.tick(), 250)`.

- [ ] **Step 1:** Implement `server/index.ts`.
- [ ] **Step 2:** Start the `room-server` preview, then run `curl -s localhost:8787/health`. Expected: `ok`.
- [ ] **Step 3:** Run a one-off `node -e` WebSocket script that sends `create` and prints the reply. Expected: a `welcome` message, then `room`.
- [ ] **Step 4:** Commit: `server: http + websocket entry point`.

### Task 6: Client connection with reconnect and simulated bad network

**Files:**
- Create: `src/net/connection.ts`
- Test: `src/net/connection.test.ts`

**Interfaces:**
- Consumes: `ClientMessage`, `ServerMessage`, `RECONNECT_GRACE_MS` (Task 1).
- Produces:
  - `type ConnStatus = 'connecting' | 'open' | 'reconnecting' | 'closed'`;
  - `interface NetLink { sendJson(msg: ClientMessage): void; sendBinary(buf: ArrayBuffer): void }`;
  - `type LagSim = { lag: number; jitter: number; loss: number }`;
  - `parseLagSim(search: string): LagSim | null` (reads `?lag=&jitter=&loss=`; null when all are absent);
  - `class Connection implements NetLink`:
    - `constructor(url: string, handlers: { onOpen(reconnect: boolean): void; onMessage(m: ServerMessage): void; onSnapshot(buf: ArrayBuffer): void; onStatus(s: ConnStatus): void }, opts?: { lag?: LagSim | null; WebSocketImpl?: typeof WebSocket; now?: () => number; setTimer?: typeof setTimeout })`;
    - `close(): void` (intentional, so no reconnect).

Behaviour:
- `binaryType = 'arraybuffer'`.
- An unexpected close → `reconnecting`, with retries at 500, 1000, 2000, 4000, 4000… ms. Once `RECONNECT_GRACE_MS` has passed since the drop → `closed`.
- Sends while not open are dropped, not queued. The game state is re-sent on resume.
- **LagSim:**
  - each outgoing and incoming message is delayed by `lag/2 + random × jitter/2`;
  - with probability `loss%`, an extra 200–400 ms is added, standing in for a TCP retransmit;
  - delivery is never earlier than the previous message's delivery, so order is kept (WebSocket is TCP).

- [ ] **Step 1: Write the failing tests** (fake WebSocket class and fake timers through `vi.useFakeTimers()`)

```ts
it('reconnects with backoff 500, 1000, 2000, 4000 ms and calls onOpen(true)')
it('gives up and reports closed 15 s after the drop')
it('does not reconnect after close()')
it('parses ?lag=250&jitter=80&loss=5 and returns null without params')
it('with lag simulation, delivers in order even when jitter would reorder')
```

- [ ] **Step 2:** Run `npx vitest run src/net/connection.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx vitest run src/net/connection.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `net: websocket connection, reconnect and lag simulation`.

### Task 7: Online store, Online and Lobby screens

**Files:**
- Create:
  - `src/net/store.ts` (zustand `useNet`, plus module-level `Connection` and `ClockSync`);
  - `src/ui/Online.tsx`;
  - `src/ui/Lobby.tsx`.
- Modify:
  - `src/game/store.ts`: `Screen` gains `'online' | 'lobby'`; `State` gains `online: boolean` and `startOnlineRace(): void` (the same as `startRace`, but sets `online: true`); `quitRace` sets `online: false`;
  - `src/ui/Menu.tsx`: a "Race with friends" button → `setScreen('online')`;
  - `src/App.tsx`: render `Online` and `Lobby`; on mount, if `?room=` is present, `setScreen('online')`;
  - `src/styles.css`: lobby styles reusing the existing `.card`, `.btn` and `.table` classes.

**Interfaces:**
- Consumes: `Connection` and `parseLagSim` (Task 6), `ClockSync` (Task 2), protocol (Task 1).
- Produces: `useNet` state:
  - fields: `{ status: ConnStatus | 'idle'; code: string | null; mySlot: number | null; room: RoomView | null; error: ErrorCode | 'unreachable' | null; nickname: string; pendingGrid: { raceSeq: number; grid: GridEntry[]; seed: number; trackId: string; laps: number } | null }`;
  - actions: `create(name: string, vehicle: VehicleId)`, `join(code: string, name: string, vehicle: VehicleId)`, `setVehicle(v)`, `setReady(b)`, `setFillAI(b)`, `start()`, `leave()`;
  - also exports `getClock(): ClockSync` and `getLink(): NetLink | null` for Task 8.
  - Nickname is persisted under the localStorage key `lagos-racer:nick` and the token in sessionStorage under `lagos-racer:net-token`. Both reads and writes are wrapped in try/catch.
  - On `welcome`, send 5 pings 100 ms apart, then one every 5 s.
  - `onOpen(true)` sends `resume`.
  - In dev: `window.__lrNet = useNet`.

UI:
- **Online screen:** nickname field, then **Create room**, or a code input + **Join room** (pre-filled from `?room=`). Errors map to the copy in Global Constraints; `unreachable` shows "Connection don cut".
- **Lobby:**
  - big room code, and **Share**, which calls `navigator.share({ url: origin + '/?room=' + code })` or falls back to copying to the clipboard;
  - a players table (name, vehicle dot + name, ready tick, "(host)");
  - a vehicle picker limited to unlocked vehicles, with the same rule as Garage: `!v.locked || unlocked.includes(v.id)`;
  - a **Ready** toggle;
  - host only: **Fill with AI** (disabled until Task 15) and **Start**, enabled when at least 2 players are connected and all are ready;
  - **Leave**.

- [ ] **Step 1:** Implement the store and screens.
- [ ] **Step 2:** Run `npm run typecheck && npm test`. Expected: PASS.
- [ ] **Step 3:** Check it in the browser:
  - start the `room-server` and `lagos-racer` previews;
  - in tab A, create a room; in tab B, open `/?room=<code>` and join;
  - both tabs list both players, ready ticks sync, and Start becomes enabled for the host only;
  - check the lobby at the mobile preset; nothing overflows.
- [ ] **Step 4:** Commit: `ui: online menu and lobby`.

### Task 8: Online race setup and synced countdown

**Files:**
- Create:
  - `src/game/setup.ts` (move `makeRace` and `rivals` out of `RaceScene.tsx` unchanged, then extend);
  - `src/game/random.ts`;
  - `src/net/session.ts` (first part: clock, start, loaded).
- Modify:
  - `src/game/runtime.ts`;
  - `src/scene/RaceScene.tsx`;
  - `src/scene/RaceLogic.tsx`;
  - `src/ui/Race.tsx`;
  - `src/ui/PauseMenu.tsx`;
  - `src/net/store.ts` (on `grid`, create the session and call `useGame.getState().startOnlineRace()`; on `start`, `session.setStart(at)`).
- Test: `src/game/setup.test.ts`, `src/net/session.test.ts`.

**Interfaces:**
- Consumes: `GridEntry`, `ClockSync`, `NetLink`.
- Produces:
  - **`runtime.ts`:**
    - `Racer` gains `kind: 'local' | 'ai' | 'remote'`, `owner: number` (slot; 0 offline) and `remote: RemoteCar | null`. `makeRacer` sets `kind = isPlayer ? 'local' : 'ai'`, `owner = 0`, `remote = null`. `Racer.id` *is* the netId online.
    - `type RemoteCar = { buffer: SnapshotBuffer; dnf: boolean }` (type-only import from Task 9's file; until Task 9 exists, declare it as `{ dnf: boolean }` and widen it in Task 9).
    - `RaceRuntime` gains `net: NetHooks | null`.
    - `interface NetHooks { now(): number; pickup(orb: number): void; use(h: Hazard): void; hit(hazardId: number, victim: number): void; finish(r: Racer): void }`. `now()` returns the synced race clock in seconds, negative before the start.
  - **`random.ts`:** `seededRandom(seed: number): () => number` (mulberry32).
  - **`setup.ts`:**
    - `type OnlineSetup = { grid: GridEntry[]; mySlot: number; seed: number }`;
    - `makeRace(trackId: string, playerVehicle: VehicleId, online?: OnlineSetup)`.
    - Online, there is one racer per grid entry at grid position `netId`. `kind` is `'local'` for my human car, `'ai'` for AI entries owned by my slot, and `'remote'` otherwise.
    - `isPlayer` is true only for `kind === 'local'`; `name` is the entry name.
    - AI `skill` uses `seededRandom(seed)`, `makeCritters(…, seededRandom(seed))`, and `nextId = mySlot × 100000`.
  - **`session.ts`:**
    - `class NetSession implements NetHooks`, constructed with `(link: NetLink, clock: ClockSync, setup: OnlineSetup & { raceSeq: number })`;
    - `attach(race: RaceRuntime): void` (sets `race.net = this`);
    - `setStart(at: number): void`;
    - `get started(): boolean`;
    - `loaded(): void` (sends `{t:'loaded'}` once);
    - `now()` returns `(clock.serverNow() − startAt) / 1000`, or `-START_LEAD_MS / 1000` before the start is known.
    - `pickup`, `use`, `hit` and `finish` are no-ops until Tasks 10–14.
  - Module getter `getSession(): NetSession | null` in `store.ts`.

Race changes:
- `RaceScene` uses `makeRace(…, online)` when `useGame.online`, and calls `session.attach(race)` + `session.loaded()` in its layout effect.
- `Physics paused={paused && !online}`.
- **RaceLogic online:**
  - before the start time is known, the HUD countdown shows "Waiting for others…";
  - otherwise `race.countdown = −race.net.now()` and the label is driven from that (the same 3 / 2 / 1 / OYA GO!);
  - while racing, `race.clock = race.net.now()` instead of `+= dt`;
  - the controls loop drives `kind === 'local'` from input and `kind === 'ai'` with `driveAI`, and skips `'remote'`;
  - the local results computation is skipped online (Task 14 supplies results);
  - `store.paused` doesn't stop the loop online.
- `Race.tsx` doesn't auto-pause on `visibilitychange` when online.
- `PauseMenu` online shows Resume, Settings and **Leave race** (`useNet.leave()`, then `quitRace()`), with no Restart.

- [ ] **Step 1: Write the failing tests**

```ts
// setup.test.ts
it('offline makeRace is unchanged: 6 racers, the player last and local, the rest ai')
it('online: my entry is local, other humans remote, owners set from grid slots')
it('online: hazard ids start at mySlot × 100000')
it('online: the same seed gives identical critters and AI skills on two calls')
// session.test.ts
it('now() is negative before start and counts seconds from the server start time')
it('sends loaded exactly once')
```

- [ ] **Step 2:** Run `npx vitest run src/game/setup.test.ts src/net/session.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Move `makeRace` first and run `npm test` to prove the move changed nothing, then add the online parts.
- [ ] **Step 4:** Run `npm run typecheck && npm test`. Expected: PASS.
- [ ] **Step 5:** Check it in the browser:
  - with two tabs, host starts;
  - both load the race and show "OYA GO!" within about 100 ms of each other (compare `__lr.getRace().clock` in both tabs right after the start; the difference should be under 0.1 s);
  - Esc online opens the menu without freezing physics;
  - single-player from the main menu still works exactly as before.
- [ ] **Step 6:** Commit: `race: online setup, synced countdown, no pause online`.

## Phase 2: Live cars

### Task 9: Snapshot interpolation buffer

**Files:**
- Create: `src/net/interpolation.ts`
- Test: `src/net/interpolation.test.ts`

**Interfaces:**
- Consumes: `CarState`, `TICK_HZ`.
- Produces:
  - `type Pose = { x: number; y: number; z: number; qx: number; qy: number; qz: number; qw: number; vx: number; vy: number; vz: number }`;
  - `class SnapshotBuffer`:
    - `push(car: CarState, time: number, arrival: number): void` (`arrival` is the local synced race clock at receipt; ignored unless `time` is newer than the newest);
    - `renderTimeAt(now: number): number` (`now − delay`);
    - `get delay(): number` = `median(lateness of last 30) + clamp(1/TICK_HZ + 2·std(lateness), 0.1, 0.25)`, where `lateness = arrival − time`;
    - `sample(renderTime: number, out: Pose): 'interp' | 'extrap' | 'hold' | 'empty'`;
    - `latest(): CarState | null`.
  - It keeps the newest 32 entries. Rotation is a slerp (three's `Quaternion.slerpQuaternions`). Extrapolation runs along the newest velocity for at most 0.25 s past the newest time; after that it holds.

- [ ] **Step 1: Write the failing tests**

```ts
it('interpolates position and velocity halfway between two snapshots')   // t=1 x=0, t=2 x=10 -> sample(1.5).x = 5, 'interp'
it('slerps rotation')                           // identity -> yaw 90° at half -> yaw 45° (±0.5°)
it('extrapolates up to 0.25 s then holds')      // newest t=2 x=10 vx=20: sample(2.1).x=12 'extrap'; sample(2.5).x=15 'hold'
it('ignores snapshots that are not newer than the newest')
it('delay is median lateness plus a 0.1–0.25 s cushion')
  // constant lateness 0.08 -> delay 0.18
  // alternating 0.05/0.25 -> median 0.15 + cushion clamped 0.25 = 0.40
it('returns empty before any snapshot')
```

- [ ] **Step 2:** Run `npx vitest run src/net/interpolation.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Widen `RemoteCar` in `runtime.ts` to `{ buffer: SnapshotBuffer; dnf: boolean }`.
- [ ] **Step 4:** Run `npx vitest run src/net/interpolation.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `net: snapshot interpolation buffer`.

### Task 10: Send and apply snapshots on the client

**Files:**
- Modify:
  - `src/net/session.ts`;
  - `src/game/race.ts` (add `trackRemote`);
  - `src/scene/RaceLogic.tsx`;
  - `src/net/store.ts` (route binary messages to `session.onSnapshot`).
- Test: extend `src/net/session.test.ts` and `src/game/race.test.ts`.

**Interfaces:**
- Consumes: `encodeSnapshot`, `decodeSnapshot`, `FLAG`, `SnapshotBuffer`.
- Produces:
  - `NetSession.update(race: RaceRuntime): void`. Called every frame from RaceLogic. When `now()` has advanced at least `1/TICK_HZ` since the last send, it sends one snapshot of every racer with `kind !== 'remote'` (pose from `body`, `progress.distance`, `progress.lapsDone`, flags from `boost`, `slip`, `curse`, `wobble`, `controls.horn` and `finishTime !== null`). The send time then becomes `now()`, not `last + 1/15`, so a long frame gap never causes a burst.
  - `NetSession.onSnapshot(buf: ArrayBuffer): void`:
    - drops messages whose `raceSeq` doesn't match, or that come from my own slot;
    - for each car whose racer is `kind === 'remote'`: `remote.buffer.push(car, snap.time, now())`; set `progress.distance` and `progress.lapsDone`; set `boost`, `slip`, `curse` and `wobble` to 1 or 0 from the flags, and `controls.horn` from the horn flag.
    - Unknown netIds are ignored.
  - `trackRemote(track: Track, p: RacerProgress, x: number, z: number): void` updates only `index`, `s` and `lateral`.
- RaceLogic: the progress loop calls `trackRemote` for remote racers instead of `updateProgress`. The HUD standings use `race.racers.filter(r => !r.remote?.dnf)`.

- [ ] **Step 1: Write the failing tests** (fake `NetLink` records sends; fake racers have `body` stubs with `translation()`, `rotation()` and `linvel()`)

```ts
it('sends one snapshot per 1/15 s containing only local and ai cars')
it('after a 20 s frame gap sends one snapshot, not a burst')     // Review Focus 1
it('applies remote distance, laps and effect flags')
it('drops snapshots from another raceSeq or from my own slot')   // Review Focus 4
// race.test.ts
it('trackRemote updates index, s and lateral but never distance or laps')
```

- [ ] **Step 2:** Run `npx vitest run src/net/session.test.ts src/game/race.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx vitest run`. Expected: PASS.
- [ ] **Step 5:** Commit: `net: send and apply car snapshots`.

### Task 11: Server snapshot relay

**Files:**
- Modify: `server/room.ts`.
- Test: extend `server/rooms.test.ts`.

**Interfaces:**
- Consumes: `decodeSnapshot`.
- Produces: in phases `countdown` and `racing`, a binary message from a member is decoded and dropped unless:
  - `slot` equals the sender's slot;
  - `raceSeq` matches the room's (mod 256);
  - every `netId` is a grid entry owned by that slot.
- Valid messages are forwarded *unchanged* (the same bytes) to every other connected grid member. Task 13 also feeds them to the referee.

- [ ] **Step 1: Write the failing tests**

```ts
it('forwards a valid snapshot byte-for-byte to the other racers only')
it('drops snapshots claiming another slot, another raceSeq, or a car the sender does not own')
it('drops snapshots in the lobby')
```

- [ ] **Step 2:** Run `npx vitest run server`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx vitest run server`. Expected: PASS.
- [ ] **Step 5:** Commit: `server: validated snapshot relay`.

### Task 12: Remote cars in the scene

**Files:**
- Modify:
  - `src/scene/Vehicle.tsx`;
  - `src/game/critters.ts` (`checkHits` only applies speed loss and wobble when `r.kind !== 'remote'`; the critter still flies);
  - `src/styles.css` (`.name-tag`).
- Create: `src/scene/NameTag.tsx`.

**Interfaces:**
- Consumes: `racer.remote.buffer`, `race.net.now()`.
- Produces: no new exports beyond `NameTag({ name }: { name: string })`, which is drei `<Html>` with a small CSS label above the car and `pointerEvents: none`.

Vehicle changes for `racer.kind === 'remote'`:
- `RigidBody type="kinematicPosition"`, with no `ccd` and no vehicle controller (keep the `racer.body` and `racer.visual` bookkeeping);
- `useBeforePhysicsStep`:
  - `buffer.sample(buffer.renderTimeAt(race.net.now()), pose)`, then `setNextKinematicTranslation` and `setNextKinematicRotation`;
  - `racer.speed` = the pose velocity along the forward axis;
  - skip the respawn check.
- `'empty'` keeps the body at its spawn.
- If `remote.dnf`, move it to `y = −200` and hide the visual.
- Render `<NameTag name={racer.name} />` for remote cars.
- Collisions need no change. The local car's `onCollisionEnter` already reads the other racer's mass through `userData.racer`.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Run `npm run typecheck && npm test`. Expected: PASS.
- [ ] **Step 3:** Check it in the browser:
  - two tabs, one with `?autopilot=1`;
  - in the other tab the autopilot car moves smoothly with a name tag, its position shows in the HUD, and bumping it slows the lighter car;
  - repeat with `?lag=250&jitter=80&loss=5` on both tabs: still smooth, just further behind;
  - take a mobile-preset screenshot of a remote car with its name tag as proof.
- [ ] **Step 4:** Commit: `scene: kinematic remote cars with name tags`.

## Phase 3: Items online

### Task 13: Item events (client and server)

**Files:**
- Modify:
  - `src/game/items.ts`;
  - `src/net/session.ts`;
  - `src/net/store.ts` (route `pickup`, `use` and `hit` to `session.onEvent`);
  - `server/room.ts`.
- Test: `src/game/items.test.ts` (new); extend `server/rooms.test.ts`.

**Interfaces:**
- Consumes: `NetHooks` (Task 8).
- Produces:
  - **items.ts:** remote racers never pick up orbs or use items locally. After a pickup → `race.net?.pickup(p.id)`. After pushing a hazard → `race.net?.use(h)`. Oil and juju hits only test `kind !== 'remote'` victims; on a hit → `race.net?.hit(h.id, r.id)`. `jujuTarget` and `updateJuju` skip racers with `remote?.dnf`.
  - **`NetSession.onEvent(m: ServerMessage): void`:**
    - `pickup` → that orb's `respawn = 3`;
    - `use` → push the hazard if its id isn't present yet;
    - `hit` → juju: puff at the hazard and `life = 0`; oil: `life = min(life, 8)`. The victim's effects come from snapshot flags.
  - `pickup`, `use` and `hit` hooks send the matching ClientMessage.
  - **Server:** relays `pickup`, `use` and `hit` with `from` added, to every other grid member, only in `racing`. It drops a `use` whose `hazard.id` is outside `[slot×100000, (slot+1)×100000)`, and a `hit` whose `netId` isn't owned by the sender.

- [ ] **Step 1: Write the failing tests** (`items.test.ts` builds a race on the test track from `race.test.ts` with fake bodies)

```ts
it('offline behaviour unchanged: the player picks up an orb and juju hits the AI ahead')
it('remote racers do not pick up orbs locally')
it('a pickup by a local car calls net.pickup with the orb id')
it('oil does not affect a remote racer locally; it affects a local one and calls net.hit')
it('juju aimed at a remote car keeps homing and is only removed by a hit event')
it('juju never targets a DNF racer')
// rooms.test.ts
it('relays item events with from, and drops forged hazard ids and hits on cars not owned')
```

- [ ] **Step 2:** Run `npx vitest run src/game/items.test.ts server`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx vitest run`. Expected: PASS.
- [ ] **Step 5:** Check it in the browser: in two tabs, throw juju from A at B. B spins out, and A sees the purple aura on B and the puff. Oil dropped by B makes A slide.
- [ ] **Step 6:** Commit: `items: online pickups, throws and hits`.

## Phase 4: Referee and results

### Task 14: Referee, finish and shared results

**Files:**
- Create: `server/referee.ts`, `src/net/results.ts`.
- Modify:
  - `server/room.ts`;
  - `src/game/race.ts` (add `coinsForPlace`);
  - `src/scene/RaceLogic.tsx` (use `coinsForPlace` offline too);
  - `src/net/session.ts`;
  - `src/net/store.ts`;
  - `src/ui/Results.tsx`.
- Test: `server/referee.test.ts`; extend `server/rooms.test.ts`; `src/net/results.test.ts`.

**Interfaces:**
- Consumes: `project` and `wrapDelta` (`src/game/track.ts`), `buildTrack`, `trackById`, `vehicleById`.
- Produces:
  - **`class Referee`:**
    - `constructor(track: Track, laps: number, grid: GridEntry[])`;
    - `observe(car: CarState, time: number): void`. If the projected track position disagrees with `car.distance mod length` by more than 30 m, ignore it. Otherwise set the referee distance to `clamp(car.distance, refDist − 50, refDist + maxTopSpeed × 1.6 × (time − lastTime) + 10)`. This deliberately does not use `updateProgress`, whose 25 m step limit would wrongly reject a car's distance after a reconnect gap.
    - `finish(netId: number, laps: number[], time: number): boolean`. It accepts only if all the Global Constraints referee rules pass; a rejection marks the car DNF.
    - `dnf(netId: number): void`;
    - `get firstFinishAt(): number | null`;
    - `allDone(): boolean`;
    - `results(now: number): NetResult[]`. Finished cars come first by time, then unfinished cars by distance with projected times (`now + remaining / average speed`, the same formula as RaceLogic), with DNF last and `time: null`.
  - `coinsForPlace(place: number): number` in `race.ts` (the table `[150, 100, 60, 30]`, else 20).
  - `toResults(net: NetResult[], mySlot: number): Result[]` in `src/net/results.ts`. It sets `isPlayer = !ai && slot === mySlot`, and DNF gives `time: null`.
  - **Server:**
    - snapshots also feed `referee.observe` with the snapshot's time;
    - a `finish` from the owning slot → `referee.finish`, and on acceptance broadcast `finished {netId, time}`;
    - the first accepted finish starts the `FINISH_CUTOFF_MS` timer in `tick()`;
    - at the cutoff, or when `allDone()`, broadcast `results`, set the phase to `lobby`, reset everyone's ready flag, and broadcast `room`.
  - **Client:**
    - RaceLogic calls `race.net.finish(r)` when a non-remote racer's `updateProgress` reports `finished`;
    - `finished` sets that remote racer's `progress.finishTime`;
    - `results` → `useGame.finishRace(toResults(...), coinsForPlace(myPlace), myBest)`.
  - **Results online:** buttons are **Back to lobby** (`setScreen('lobby')`) and **Leave** (`useNet.leave()`, then `quitRace()`), and the account prompt is hidden.

- [ ] **Step 1: Write the failing tests**

```ts
// referee.test.ts (test track from race.test.ts; drive cars by feeding observe() along sampleAt)
it('accepts a clean 3-lap finish')
it('rejects a lap faster than length / (maxTopSpeed × 1.6), and accepts a maxed-upgrade lap')
it('rejects a finish when the observed distance is 30 m+ short')
it('rejects lap times that do not sum to the finish time')
it('keeps up after a 10 s snapshot gap if the jump is physically possible')
it('ignores a pose that disagrees with the reported distance')
it('orders results: finished by time, then by distance with projections, then DNF')
// rooms.test.ts
it('broadcasts finished, then results 30 s after the first finish, then returns to lobby with ready reset')
it('sends results early when every car has finished or is DNF')
// results.test.ts
it('marks only my slot as the player even when another player has the same name and vehicle')  // Review Focus 2
it('maps DNF to time null')
```

- [ ] **Step 2:** Run `npx vitest run`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx vitest run && npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** Check it in the browser: race two autopilot tabs to the end. Both show the same results table, and **Back to lobby** returns both to the lobby with Ready unticked.
- [ ] **Step 6:** Commit: `referee: validated finishes and shared results`.

## Phase 5: AI fill

### Task 15: Host-owned AI cars

**Files:**
- Modify:
  - `server/grid.ts`;
  - `server/room.ts`;
  - `src/ui/Lobby.tsx` (enable the **Fill with AI** toggle).
- Test: extend `server/grid.test.ts` and `server/rooms.test.ts`.

**Interfaces:**
- Consumes: `AI_NAMES` (`src/game/ai.ts`), `VEHICLES` (`src/config/vehicles.ts`).
- Produces: `buildGrid(members, fillAI: boolean, hostSlot: number, random: () => number): GridEntry[]`. The Task 4 call site passes `room.fillAI, room.hostSlot, deps.random`.
  - With `fillAI`, AI entries fill the grid up to `GRID_SIZE`. AI goes at the **front** and humans behind in slot order, as in single-player where you start behind the AI.
  - AI vehicles are chosen in `VEHICLES` order, preferring ones no human picked. Names are drawn from `AI_NAMES` with `random`, without repeats. AI entries have `slot = hostSlot` and `ai: true`.
- The client needs no change. Task 8 already maps AI entries owned by my slot to `kind: 'ai'`, and Task 10 already sends their snapshots.

- [ ] **Step 1: Write the failing tests**

```ts
it('humans only when fillAI is false')
it('fills to 6 with AI at the front, owned by the host, with distinct names')
it('AI prefers vehicles no human picked')
it('when the host drops for 15 s mid-race, their AI cars are DNF too')   // dnf message lists the host car and all AI netIds
```

- [ ] **Step 2:** Run `npx vitest run server`. Expected: FAIL.
- [ ] **Step 3:** Implement. The DNF-on-drop rule itself lands in Task 16; this test is written now and passes after Task 16, so mark it `it.todo` here and switch it on in Task 16.
- [ ] **Step 4:** Run `npx vitest run server`. Expected: PASS (with the todo).
- [ ] **Step 5:** Check it in the browser: the host turns on **Fill with AI** with two humans. The race has 6 cars, and the AI cars drive smoothly on the non-host tab.
- [ ] **Step 6:** Commit: `rooms: optional AI fill driven by the host`.

## Phase 6: Dropped connections and deploy

### Task 16: Dropped connections, DNF and error screens

**Files:**
- Modify:
  - `server/room.ts`;
  - `src/net/store.ts`;
  - `src/net/session.ts`;
  - `src/ui/Online.tsx`, `src/ui/Lobby.tsx`, `src/ui/Race.tsx`.
- Test: extend `server/rooms.test.ts` and `src/net/session.test.ts`.

**Interfaces:**
- Consumes: Tasks 3, 8 and 14.
- Produces:
  - **Server:**
    - a member disconnected for `RECONNECT_GRACE_MS` during `countdown` or `racing` → `referee.dnf` on every netId they own (including the host's AI) and broadcast `dnf {netIds}`;
    - an explicit `leave` during a race does the same immediately;
    - a resumed member who isn't in the current grid gets `welcome` + `room` (phase `racing`) and waits;
    - members whose grace has expired are removed when the room returns to the lobby.
  - **Client:**
    - `dnf` → set `remote.dnf = true` for those netIds. If it lists my own car, show "Network wahala" through `store.flash` and keep driving locally.
    - Status `reconnecting` shows a small "Reconnecting…" badge in the race HUD and lobby.
    - `closed` shows the "Connection don cut" modal with **Back to menu**.
    - A resumed player in the lobby while the phase is `racing` sees "Race in progress, you go join the next one."

- [ ] **Step 1: Write the failing tests**

```ts
it('a racer gone for 15 s is DNF and dnf is broadcast')
it('leave during a race DNFs at once')
it('a player resuming during a race they are not in gets the room in racing phase')   // Review Focus 3
it('expired members are removed when the room returns to the lobby')
// switch on the Task 15 todo: host drop DNFs their AI too
// session.test.ts
it('dnf hides remote cars; dnf of my own car only flashes the message')
```

- [ ] **Step 2:** Run `npx vitest run`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx vitest run && npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** Check it in the browser:
  - stop the room server for 5 s mid-race and start it again: the clients show "Connection don cut" (rooms are lost);
  - with the server up, close tab B's network for a moment (DevTools offline, under 15 s): B resumes and keeps racing;
  - for more than 15 s: A sees B vanish and B's result is DNF.
- [ ] **Step 6:** Commit: `net: reconnect, DNF and error screens`.

### Task 17: Automated multi-tab race

**Files:**
- Create: `scripts/net-race.mjs`.
- Modify: `README.md` (add a row to the commands table).

**Interfaces:**
- Consumes: the dev handle `window.__lrNet` (Task 7), `window.__lr` (existing), and the CDP helpers from the approach in `scripts/playtest.mjs` (copy the minimal `send` / `evaluate` helpers; don't import from it).
- Produces: `node scripts/net-race.mjs [--tabs=3] [--lag=250 --jitter=80 --loss=5] [--url=http://localhost:5173/]`.
  - It expects the dev server to be running already, and spawns `npm run server` itself.
  - It launches headless Chrome with `--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows`, and opens N targets with `?autopilot=1` plus the lag params.
  - Tab 1 creates the room through `__lrNet`, the others join with its code, everyone readies, and tab 1 starts.
  - It waits up to 300 s for `useGame.getState().results` in every tab.
  - It prints each tab's finishing order and exits 0 only if all are identical, otherwise 1.

- [ ] **Step 1:** Implement the script.
- [ ] **Step 2:** Run `node scripts/net-race.mjs --tabs=3`. Expected: identical standings printed three times, exit 0.
- [ ] **Step 3:** Run `node scripts/net-race.mjs --tabs=3 --lag=250 --jitter=80 --loss=5`. Expected: exit 0.
- [ ] **Step 4:** Commit: `scripts: automated multi-tab online race`.

### Task 18: Deploy setup and real-phone test

**Files:**
- Create: `railway.json` (`build.buildCommand: "echo no build"`, `deploy.startCommand: "npm run server"`, `deploy.healthcheckPath: "/health"`), and `.env.example` with `VITE_ROOM_SERVER=wss://<your-railway-domain>`.
- Modify:
  - `README.md`: a "Deploying multiplayer" section (Railway service in EU West, then set `VITE_ROOM_SERVER` on Vercel and redeploy);
  - `CLAUDE.md`: note the room server deploy;
  - `docs/superpowers/specs/2026-10-03-multiplayer-design.md`: nothing, unless reality differed.

- [ ] **Step 1:** Write the files and run `npm run build`. Expected: the build succeeds and `dist/` is unchanged in shape.
- [ ] **Step 2:** Commit: `deploy: railway config and docs`.
- [ ] **Step 3 (user, with confirmation):** Deploy to Railway and set `VITE_ROOM_SERVER` on Vercel. This publishes a public service on the user's accounts, so ask before doing it, and let the user run it if they prefer.
- [ ] **Step 4 (user):** Real-phone race: at least one phone on Wi-Fi and one on MTN or Airtel data, Low quality. Record how smooth the remote cars look, any juju or oil that misbehaved, and whether the results match. Feed the findings back as tuning, such as the interpolation cushion and bump knock.
