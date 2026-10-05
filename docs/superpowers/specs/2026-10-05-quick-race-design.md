# Quick race: matchmaking with strangers

Date: 5 October 2026. Extends `2026-10-03-multiplayer-design.md`, which left public matchmaking out of scope.
Voice chat is a separate follow-up spec; nothing here depends on it.

## Why

Most players will not have a friend online at the same moment. Quick race lets anyone press one button and be racing within about 30 seconds, with real people when there are any and with believable fill when there are not. The empty-server problem must never be visible: a new game with 3 players online should still feel alive.

## What the player sees

1. Menu has a **Quick race** button beside Play with friends. It asks for a nickname (remembered) and joins a public room.
2. The lobby shows "Looking for racers…" and a 30 second countdown. The player still picks vehicle and driver. There is no Ready button and no host Start button.
3. Players appear in the list as they join. Some of those are bots (see below); the player cannot tell.
4. Everyone votes for a track; the lobby shows the tally per track. Most votes wins when the countdown ends; ties and no votes are broken at random among the tied tracks.
5. When the countdown ends (or the sixth human joins, which starts it at once), the normal loading, countdown and racing phases run.
6. After the results, the room closes. **Race again** runs a fresh Quick race search; **Menu** leaves.

Friends' rooms are unchanged.

## Decisions already made

- Public flag on the existing `Room`, not a separate queue service.
- 30 s wait for humans, early start at 6 humans, then bots fill every empty grid slot (6 total).
- Bots are disguised as people: believable nicknames, never labelled, human-like driving. No coins and no leaderboard entries for bots.
- The room's server drives the timer, the vote and the start, because there is no host.
- Track by lobby vote.
- If the phone driving the bots leaves, the next connected human takes over the bots; with no human left the race ends.
- Voice is a later spec. Bots will be silent on voice, like a muted player.

## Server

### Rooms

`Room` gets `quick: boolean`. Quick rooms differ from friends' rooms only where stated here.

- `RoomServer.quick(conn, name, vehicle, paint)` finds the public room still in `lobby` phase with the fewest seconds left and a free human seat, else creates one. A room leaves the open set when it is full of humans, starts, or empties. Joining an open room does not reset its timer.
- The timer starts when the **first human** is seated and runs `QUICK_WAIT_MS = 30000`. It is checked in `RoomServer.tick`, which already visits every room.
- `hostSlot` is `0` in Quick rooms (nobody hosts). `start` and `fillAI` changes are refused with `not-host`. `ready` is ignored: the server treats every connected human as ready.
- Room code is still generated and sent in `welcome`, but the client does not show it and there is no share link.
- `MAX_QUICK_ROOMS = 50`. When all are in use, `quick` creates nothing and the player is told `busy`, with the friends' rooms and single player still available.
- A human who joins when the lobby would otherwise hold 7 people (6 humans plus a bot) displaces a bot first: the bot leaves the list, at a random moment within a few seconds, like anyone leaving.
- Rate limits, nickname cleaning, resume tokens and the reconnect grace stay as they are. The lobby grace and silence rules apply.
- Track: `Room.trackId` becomes mutable and is set from the vote when the race starts. Friends' rooms keep the server default.

### Track vote

- New client message `{ t: 'vote'; trackId: string }`. Valid only in a Quick room's lobby, only for a track in `TRACKS`; a human's latest vote replaces the earlier one. Bots do not vote.
- Tracks have no unlock gate today (only vehicles and drivers do), so any track can be voted for and raced.
- `RoomView` gains `quick?: { startsInMs: number; votes: Record<string, number> }`. The client counts down locally from `startsInMs`, which the server re-sends on every room broadcast.
- Resolution at the end of the wait: highest count; ties and zero votes pick uniformly at random among the tied tracks (or among all tracks if there are no votes), using the room's `random`.

### Disguised bots

The roster lives in a new `server/bots.ts`, kept apart from `Room` so it can be tested alone.

- **Names:** a pool of about 60 nicknames in the style real Lagos players use (short, mixed case, some with numbers, some in Pidgin). Never repeated within a room, never equal to a human's name in the room. The existing `AI_NAMES` list (parody characters) is **not** used in Quick rooms, because it would give the game away.
- **Look:** a random vehicle the humans did not pick if possible, and a paint no one on the grid has for that vehicle yet, as `buildGrid` does today.
- **Arrival:** at the start of the wait the roster decides how many bots will exist (all missing seats, so the grid is full) and schedules each one's appearance at a random time between 3 s and 26 s. Bots appear in `RoomView.players` as connected, ready members with slots 7 and up, so a human's slot number is never reused by a bot.
- **Skill:** drawn per bot from a range around 0.85–1.0 of the AI skill scale, so bots are close to a mid-level human. Nothing in the lobby exposes it.
- **Behaviour:** driven by the existing rival AI, with a human-ness layer added in the client: slightly late starts at the green light (0–0.4 s random), gentle lane wobble, an occasional small mistake on bends (a brief lift or a wide line), and power-ups held for a random 0.5–3 s before use. Bots also use the same hazards and pickups as humans. Detail and tuning belong in the implementation plan.
- **Voice (later):** silent.

### Hiding the flag

Today `ai` reaches every client in `GridEntry` and `NetResult`, and clients use it for two things: whether this phone drives a car (`setup.ts`, `kind`), and who "me" is (`results.ts`, `store.ts`). The flag must not tell other players who is a bot.

- In Quick rooms the server sends each recipient a version of the grid and results in which `ai` is `true` **only for cars that recipient drives**, and `false` for every other car. A car's real bot status stays on the server.
- Consequently the phone driving the bots sees `ai: true` for them (it must), and sees `ai: false` for human opponents. Everyone else sees `ai: false` throughout.
- The client's existing logic keeps working unchanged: `ai` plus "owned by me" means "I drive this one", and "me" stays `!ai && slot === mySlot`. The bot-driving phone's own bots carry `ai: true`, so they are never mistaken for "me".
- Bots use the slot of the human who currently drives them (as AI cars already use the host's slot). Resumed phones get their own recipient-filtered grid.
- The server still marks bot cars `ai: true` internally for the referee, results and coins.

### Bot ownership handover

- At race start the bots belong to the **lowest connected human slot** (not a host).
- If that human leaves for good, or goes past the reconnect grace, the server reassigns every bot car to the next lowest connected human and sends them `{ t: 'adopt'; netIds: number[] }`. Today a leaving owner's cars go DNF; in Quick rooms the bots are exempt from `dropOut` and only the leaver's own car goes DNF.
- The new owner starts simulating each adopted car from the last snapshot it received for it (position, rotation, velocity, `distance`, `laps`), then drives it with the same bot AI. It rolls a new skill in the bot range, so a handover is allowed to change the bot's pace slightly.
- Snapshots for adopted cars are accepted from the new owner immediately (the server's `owns()` is updated at the moment of reassignment). A short gap in updates may appear while the old owner's last snapshots are in flight; remote interpolation already tolerates this.
- If no connected human remains, the race ends through the existing "everyone gone" path.
- `finish` for a bot car is accepted from its current owner only, as `owns()` already enforces.

### Results, coins and leaderboard

- Results from Quick rooms include bots, with `ai: false` in the recipient-filtered copy (see above). Places are shared by bots and humans exactly as today.
- Coins are paid per human result only. The client already pays coins for its own result; bots were never paid in friends' rooms either.
- A leaderboard is not built yet. When it is, it must read the server's real flag, not the wire copy, and skip bots.

## Client

- `src/net/protocol.ts`: add `vote`, `quick` (client messages), `adopt` (server message), `RoomView.quick`, error code `busy`.
- `src/net/store.ts`: handle `quick` (joins via the new message, not `create`), `vote`, `adopt`, countdown from `startsInMs`.
- `src/ui/Online.tsx`: add the Quick race button and the nickname prompt it shares with friends' rooms.
- `src/ui/Lobby.tsx`: for a Quick room, show "Looking for racers…", the countdown, the vote list, no Start, no Ready, no code or share link.
- `src/net/session.ts` and `src/game/setup.ts`: on `adopt`, convert the named remote cars into locally driven AI cars, seeded from their latest interpolated state.
- `src/game/ai.ts`: the human-ness layer described above.
- Results screen: unchanged except "Race again" for Quick rooms.

## Edge cases

- **One human and nobody joins:** at 30 s, 5 bots fill the grid and the race starts. Quick race therefore needs 1 human, unlike friends' rooms (which need 2).
- **Everyone leaves during the wait:** the room is reaped as today.
- **A human joins after 30 s:** the room is already loading, so they are placed in a new room.
- **A bot is about to appear when a human fills the last seat:** the bot's scheduled arrival is cancelled; the grid is all humans.
- **All humans leave mid-race:** unchanged (race ends, room closes).
- **Phone reconnects in the lobby:** `resume` works as today; the countdown continues on the server.
- **Same player joins twice from one phone:** two sockets, two seats, as today. No special handling.
- **Misbehaving client sends `vote` outside a Quick lobby:** ignored.
- **Server restart:** all rooms are lost, as today. Players see the existing "expired" error and can search again.

## Out of scope

- Skill-based matchmaking, regions, party queues, ranks.
- Voice chat (own spec, built after this).
- Public room browser (players only press Quick race).
- Anti-cheat beyond the existing referee.
- Telling players that bots exist anywhere in the UI. **Product note:** this is a deliberate choice of the owner. The app store listings, privacy policy and any future terms should be reviewed before launch, because some stores and regions expect AI opponents to be disclosed.

## Testing

Server tests in `server/rooms.test.ts` style, with fake sockets, a fake clock and a seeded `random`; no network.

- Find or create: first caller creates, second joins the same room, a full or started room is skipped, `busy` at the cap.
- Timer: starts at the first human, is not reset by later joins, ends at 30 s, early start at the sixth human.
- Vote: latest vote wins per human, most votes wins, tie and no-vote breaks are random among the right set, an unknown track is refused, outside a Quick lobby is ignored.
- Bots: roster size equals empty seats, names are unique and never equal a human's, arrivals fall in the window, a human displaces a bot when the lobby would hit 7.
- Flag hiding: the grid and results a non-owner gets have `ai: false` for every car; the owner gets `ai: true` for the bots only; the referee sees the real flag.
- Handover: bots move to the next human on leave and on grace expiry, `adopt` is sent, `owns()` follows, the leaver's own car goes DNF but bots do not, the race ends when no human is left.
- Friends' rooms: existing tests pass unchanged.

Client: unit tests for `adopt` conversion and for the human-ness layer's bounds. Then a two-tab race on the laptop and a throttled-network run, both on a mobile viewport, as the project rules require.

## Open items for the plan

- Exact bot nickname list (60 names) and the numbers for the human-ness layer.
- Whether bot arrival times should cluster slightly toward the end (more realistic) or be uniform.
- Check the Railway deployment and `VITE_ROOM_SERVER` in production before the playtest; Quick race is only meaningful on the deployed server.
