# Multiplayer: friends' private rooms

Date: 2026-10-03. Status: design approved in chat, awaiting spec review.

## Goal

Let 2–6 friends race each other live on the Ojuelegba track from their own phones. One player creates a
room and shares a code or link; the others join, pick vehicles, and race. Single-player stays exactly as it is.

**Success:** 2–6 phones on different networks (Wi-Fi and Nigerian mobile data) can finish a full race
together:
- the countdown ends at the same moment on every phone;
- every player sees the others moving smoothly;
- juju and crude oil hit other players;
- every phone shows the same finishing order and results.

### Decisions made

| Question | Decision |
|---|---|
| Kind of multiplayer | Private rooms for friends, joined by code or link. |
| Server | Node + TypeScript WebSocket server in this repo, sharing game code with the client. |
| Empty slots | The host chooses in the lobby: fill with AI, or humans only. |
| Netcode model | Each phone simulates the cars it owns; the server relays and referees. |

### Assumptions

- Players are mostly in Lagos, on budget Android phones and mobile data, typically 150–300 ms from the server
  with jitter and occasional packet loss.
- No accounts. Players type a nickname, which is saved on the phone.
- Same track (Ojuelegba), 3 laps, the existing items (fuel, crude oil, juju).
- Several players may pick the same vehicle. Name tags above remote cars tell them apart.

### Out of scope

Public matchmaking, accounts and the leaderboard, text or voice chat, spectating, joining a race already in
progress, host migration of AI cars mid-race, more than one server instance, and server-run physics.

## Architecture

```
 phone A (host)                 room server (Node, ws)               phone B
 ┌───────────────┐   wss    ┌─────────────────────────┐   wss    ┌───────────────┐
 │ own car       │ ───────▶ │ rooms in memory          │ ◀─────── │ own car       │
 │ AI cars (opt) │ ◀─────── │ relay snapshots/events   │ ───────▶ │ remote cars   │
 │ remote cars   │          │ clock, start, results    │          │               │
 └───────────────┘          │ lap/finish validation    │          └───────────────┘
                            └─────────────────────────┘
```

**Ownership.** Each car is simulated by exactly one phone, its owner:
- every human owns their own car;
- the host also owns the AI cars when "Fill with AI" is on.

Owners run the existing Rapier physics and controls for their cars. Every other car on a phone is a
*remote* car, moved by network snapshots.

**The server** never runs physics. It:
- manages rooms and the lobby;
- answers clock-sync pings;
- picks the grid and the start time;
- relays snapshots and events;
- tracks each car's progress from the snapshots, using the same `updateProgress` code as the client, to
  validate laps;
- decides the final results.

### Code layout

| Path | Purpose |
|---|---|
| `src/net/protocol.ts` | Message types (JSON for lobby and events), binary snapshot encode and decode, constants (tick rate, timeouts, limits). Imported by the client and the server. |
| `src/net/connection.ts` | WebSocket wrapper: connect, auto-reconnect with the player token, send queue, and the optional simulated bad network (see Testing). |
| `src/net/clock.ts` | Clock sync: estimates the server-time offset from ping round trips. |
| `src/net/interpolation.ts` | Per-car snapshot buffer: interpolates the pose at render time; extrapolates up to 0.25 s, then holds. |
| `src/net/session.ts` | Glue between the network and `RaceRuntime`: applies remote snapshots, sends owned snapshots, turns item events into hazards. |
| `src/net/store.ts` | zustand store for the online lobby: room code, players, host, AI toggle, connection status, errors. |
| `src/ui/Online.tsx`, `src/ui/Lobby.tsx` | Create/join screen and lobby screen. |
| `server/index.ts` | HTTP + WebSocket entry point and `/health` endpoint. |
| `server/room.ts` | Room state machine: lobby → countdown → racing → results → lobby. |
| `server/referee.ts` | Lap and finish validation, final standings. |

The server imports `src/game/track.ts`, `src/game/race.ts`, `src/config/tracks.ts` and
`src/config/vehicles.ts`. These need only `three` maths, which runs in Node. The server runs with `tsx` and
has its own `tsconfig` (Node types, no DOM).

### Changes to existing code

- **`Racer` (`src/game/runtime.ts`):**
  - gains `kind: 'local' | 'ai' | 'remote'` (`isPlayer` stays for "this phone's human");
  - gains `ownerId`, the player who simulates it, and `netId`, a car index shared by every phone.
- **`Vehicle.tsx`:** for a remote car, uses a `kinematicPosition` rigid body. It skips the vehicle
  controller's forces and sets the next kinematic pose from the interpolation buffer every physics step.
  The wheels still spin and steer, driven by snapshot speed and steer.
- **`RaceScene.tsx`:** `makeRace` takes an optional online setup (grid order, which cars are mine, AI
  on/off, a seed) instead of always building "you plus five AI".
- **`RaceLogic.tsx`:**
  - online, the countdown is driven by the server start time;
  - pause becomes "Leave race";
  - results come from the server instead of being computed locally.
- **`items.ts`:** item use and hits go through `session.ts` when online (see Items). Offline behaviour
  is unchanged.
- **`Menu.tsx`:** gets a "Race with friends" button.
- **`App.tsx`:** gets `online` and `lobby` screens.
- **`ai.ts` and `critters.ts`:** unchanged.

## Lobby and room flow

1. Menu → **Race with friends** → enter a nickname (pre-filled from last time) → **Create room** or
   **Join room**.
2. **Create:**
   - the server makes a 4-letter code, avoiding look-alike letters (no I, O, 0, 1);
   - the creator becomes host;
   - a **Share** button opens the phone's share sheet (Web Share API) with `https://<site>/?room=CODE`.
3. **Join:**
   - type the code, or open the link (`?room=CODE` skips straight to the nickname prompt);
   - errors: "Room not found", "Room full" (6 humans), "Race don start already".
4. **Lobby:**
   - every player picks a vehicle (from those they've unlocked) and taps **Ready**;
   - the host sees a **Fill with AI** toggle and a **Start** button, enabled when at least 2 humans are in
     and everyone is ready;
   - if the host leaves the lobby, the next player to have joined becomes host.
5. **Start:**
   - the server builds the grid (humans in join order with AI filling the gaps, or humans only) and a room
     seed, and sends both to everyone. Each grid entry carries the car's `driverId` (`moshood` or `mamaput`),
     chosen in the lobby next to the vehicle; AI cars get a random one from the room seed;
   - each phone loads the race (the lazy-loaded 3D and physics chunks can take several seconds on mobile
     data) and reports `loaded`;
   - once every phone has reported, or after 20 s, the server sets a start time 3.5 s ahead and sends it.
     Phones still loading at that point join the race late, from their grid slot;
   - each phone runs the existing countdown, and "OYA GO!" fires when the synced clock reaches the start
     time.
6. **After the race:** the server-sent results screen, then everyone returns to the lobby for a rematch.
7. **Room lifetime:** a room is deleted when its last player leaves, or after 10 minutes with no messages.

**Clock sync.** On joining, the client sends 5 pings and keeps the offset from the round trip with the
lowest latency. During the race, one ping every 5 s keeps it fresh. The race clock everywhere is
`serverTime - startTime`.

## During the race

### Car snapshots

- Each owner sends one snapshot message for all its cars at **15 Hz**, packed in binary (`DataView`).
- Each car takes about 35 bytes:
  - netId, position (3 × f32), rotation quaternion (4 × i16), linear velocity (3 × i16 at cm/s);
  - steer (i8), distance driven (f32), laps done (u8);
  - flags (u8: boost, slip, curse, wobble, horn, finished, push, cough). Push Squad and the soup cough
    are driver specials (see the drivers-and-specials design), so the byte is now full.
- Every message carries the owner's race clock time.
- The server forwards snapshots to everyone else in the room, without decoding them except to update
  its referee. Each phone downloads under 5 KB/s in a six-car race.

### Remote cars

- Rendered about **120 ms in the past** by interpolating the two snapshots around that time. The delay
  adapts between 100 and 250 ms based on measured jitter.
- If no newer snapshot exists, the car is extrapolated along its last velocity for up to 0.25 s, then held.
- Effects come from the flags: boost flame, purple juju aura, slip wobble, horn sound.

### Bumps

- Remote cars are kinematic, so they push your car without being pushed.
- On collision, your car applies the existing `knock` rule, using the *remote car's real mass*. A BRT
  barely slows when it hits an okada; the okada loses more.
- The other phone resolves the same bump from its side for its own car.
- Bumps can look slightly different on the two screens. That's the accepted trade-off for lag-free
  steering.

### Items

**Rule:** the victim's phone decides whether it was hit, because only it knows exactly where its car is.

| Event | Who sends | What happens |
|---|---|---|
| `pickup` (orb id) | Owner of the car that drove through it | Owner gets the item instantly. Every phone hides that orb for its usual 3 s respawn. If two cars grab the same orb at the same moment, both keep their items. |
| `use` (hazard id, kind, position, velocity, target netId) | Owner of the car using the item | Every phone spawns the same oil slick or juju. The juju target is chosen by the thrower from its standings at that moment. Fuel only sets the boost flag. Driver specials: `use` also carries the kinds `'push'` and `'soup'`. Push only sets the owner's `push` flag. Soup patches are spawned by each phone along the owner's car from the `soup` use event, so there are no per-patch messages; a victim's owner sends `hit` when its car is in a patch. |
| `hit` (hazard id, victim netId) | Victim's owner | The victim applies slip or curse locally, as now. Every phone plays the puff and removes the juju, or shortens the oil's life. |

Hazard ids come from `playerSlot × 100000 + counter` (slots are 1–6), so they never clash. A phone only runs hit detection
for cars it owns. For remote cars, hazards are visual until the victim's `hit` arrives.

### Goats and chickens

Goats and chickens stay local. Each phone has its own, seeded from the room seed so they start in the
same places. They only affect cars that phone owns. A remote car can still knock one flying on your
screen, with no effect on that car.

### Positions, finish and results

- Live standings on every phone sort by the `distance` and `laps` in the latest snapshots, and by finish
  time once cars finish. This is the existing `standings` function.
- When a car finishes, its owner sends `finish` with its lap times and finish clock time.
- The referee accepts the finish only if all of these hold:
  - the referee's own tracked distance for that car (from snapshots, using the same `updateProgress`) is at
    least `laps × track.length − 30 m`;
  - no lap is shorter than `track.length / (topSpeed × 1.6)`. The 1.6 allows for fuel boosts and cutting
    the inside line.
  - A rejected finish marks the car DNF.
- When the first car finishes, a 30 s timer starts. At the end of it, or when every car has finished or
  dropped, the server ranks unfinished cars by distance (with projected times, as in the current results
  screen) and sends one `results` message.
- Coins are awarded by place, using the same table as single-player.

## Dropped connections and errors

- **Short drop (under 15 s):**
  - the dropped phone keeps simulating its own car, and its remote cars hold still;
  - `connection.ts` reconnects with backoff (0.5, 1, 2, 4 s) and resends the player token, which is stored
    in `sessionStorage`;
  - the server restores the slot and the stream resumes;
  - on other phones that car held still, then glides to its new pose.
- **Long drop (15 s or more):**
  - the server marks the car DNF ("Network wahala") and tells everyone, and the car is removed;
  - the dropped player can still finish on their own screen, but their result stays DNF.
- **Host leaves mid-race:** their AI cars are removed as DNF, and the race carries on for everyone else.
- **Server unreachable or restarted:** "Connection don cut" with **Back to menu**. Rooms are in memory, so
  any race in progress is lost.
- **Phone screen off or tab in the background:** treated as a drop; the browser stops timers.
- **Limits on the server:**
  - nicknames: 1–16 characters, trimmed, control characters removed;
  - messages: 4 KB maximum;
  - rate: 30 messages/s per connection, then dropped;
  - one room per connection.

## Hosting

- One small Railway service in a European region (lowest typical latency from Lagos), started with
  `npm run server`, serving `wss://` on Railway's domain. A `/health` endpoint lets Railway check it.
- The client reads `VITE_ROOM_SERVER` (default `ws://localhost:8787` in dev). The Vercel deploy of the
  game is unchanged.
- The service worker must not cache WebSocket traffic. It doesn't by default; the online screen checks
  that it can connect.

## Testing

- **Unit tests (vitest):**
  - snapshot encode and decode round trip, including quaternion and velocity precision;
  - interpolation and extrapolation in the buffer;
  - clock-sync offset estimation;
  - room lifecycle (create, join, full, ready, start, leave, host handover, idle expiry);
  - referee (valid finish, too-fast lap, distance mismatch, 30 s cutoff, DNF on drop).
  - The server logic is tested through a fake socket, with no network.
- **Simulated bad network:** `?lag=250&jitter=80&loss=5` adds delay, jitter and packet loss in
  `connection.ts`, in both directions, so a laptop can stand in for Lagos mobile data.
- **Automated race:** `scripts/net-race.mjs`, built on the existing headless-Chrome play-test approach:
  - starts the server and opens 3 tabs with `?autopilot=1` in one room;
  - the first tab creates the room, the other two join, the host starts;
  - checks that all three tabs reach the results screen with identical standings;
  - runs once on a clean network and once with `?lag=250&jitter=80&loss=5`.
- **Real phones:** a race with at least one phone on Wi-Fi and one on MTN or Airtel data, on low
  quality.

## Build order

Each step ends with something playable, and each is a separate chunk of the implementation plan.

1. **Server, lobby and clock.** Create and join rooms, ready up, host start, synced countdown into a solo
   race on each phone.
2. **Live cars, humans only.** Snapshots, remote kinematic cars, interpolation, name tags, bumps, live
   positions.
3. **Items online.** Pickup, use and hit events.
4. **Referee and results.** Server-validated finishes, 30 s cutoff, shared results screen, rematch.
5. **AI fill.** Host toggle; host-owned AI cars sent as snapshots.
6. **Drops and deploy.** Reconnect, DNF, error screens, limits, Railway deploy, real-phone test.

## Changes made while planning

These were found while mapping the spec onto the code, and they override the sections above.

- **Interpolation delay.** The 100–250 ms buffer sits *on top of* the measured network delay, rather than
  being the whole delay. Phone → server → phone already takes 150–300 ms in Lagos, so a fixed 120 ms
  would leave remote cars permanently extrapolating.
- **No steer in snapshots.** The models don't show steered wheels, so the byte is dropped. Each car takes
  33 bytes, plus an 8-byte header that includes a `raceSeq`, so late snapshots from the previous race are
  dropped after a rematch.
- **Referee distance check.** The referee uses `project` / `wrapDelta` with a speed-based allowance, not
  `updateProgress`. `updateProgress` ignores jumps over 25 m, which would wrongly reject a car that
  reconnected after a gap.
- **Grid order.** AI cars start at the front and humans behind, in join order, as in single-player.
- **Simulated packet loss.** WebSocket runs over TCP, which never drops or reorders messages, so `loss`
  is simulated as 200–400 ms delay spikes with order kept.
- **Code layout.** `makeRace` moves from `RaceScene.tsx` to `src/game/setup.ts` so it can be unit-tested.
  `Racer.id` doubles as the netId.

## Project doc updates

`CLAUDE.md`: replace "Multiplayer is out of scope for now" with a short note that friends' private rooms
are the current milestone, link this spec, and add the room server to the tech stack.
