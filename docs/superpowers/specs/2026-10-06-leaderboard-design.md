# Leaderboard: weekly points and best times (Quick race only)

Date: 6 October 2026. Follows `2026-10-05-quick-race-design.md` and `2026-10-05-account-sync-design.md`, which both left the leaderboard and server-side score validation for later.

## Why

Online players need a reason to come back and something to beat. Two boards give that: a weekly points table that anyone can climb, and a best-time table per track for the people who care about the record.

## Decisions already made

- **Only Quick race counts.** Friends' private rooms never record anything (friends can collude or farm each other). Single-player and campaign times are measured on the phone and cannot be trusted, so they stay off.
- **Two boards:** weekly points, and best race time per track.
- **Weekly** points board, resetting Monday 00:00 Lagos time (WAT, UTC+1). Not all-time.
- **No sign-in for now.** Entries are keyed by the player's Quick race nickname. Bots and DNFs are never recorded. Tying entries to accounts comes later, with the account work.
- **The server's own referee decides the time.** Nothing is read from the phone: the time is the one `Referee.results()` accepted (`server/referee.ts`), which already checks top speed, distance and lap sums.
- **Seeded players** fill the boards for now so they do not look empty (see Seeds). They are a separate category from the live Quick race bots and are removable.
- **UI is one small icon** at the top right of the Multiplayer screen. No text label, no extra row.

## What the player sees

1. On the Multiplayer screen (`src/ui/Online.tsx`, the card with QUICK PLAY and PLAY WITH FRIENDS) a small trophy/podium icon button sits in the top-right corner of the card. It has an `aria-label` of "Leaderboard" and nothing else visible. It is not shown on the friends form.
2. Tapping it opens a compact overlay (the same modal pattern as `ConnectionCut`) with two tabs: **This week** and **Best times**. Best times has a small track picker.
3. Each board shows the top 50: rank, name, and points (weekly) or time and vehicle (best times).
4. The player's own row (matched by the nickname saved on the phone) is pinned at the bottom with their rank when they are outside the top 50.
5. The weekly tab has one line, "Last week: <name>", for the previous winner.
6. If a board has no rows (seeds off, nobody has raced) it shows "Take a Quick play race to get on the board."

## Recording an entry

1. No protocol change. The nickname the player already sent in `quick` is on the grid entry (`name`).
2. A player's key is their nickname trimmed, lower-cased and with spaces collapsed; the display name is the nickname as typed on their first recorded race.
3. When a Quick race ends, the room reads `referee.results()`. For each result that is not a bot (server's real `ai` flag, not the wire copy) and not DNF, it calls `leaderboard.record({ key, name, trackId, vehicle, time, place })`.
4. `record` runs one transaction:
   - Upsert `best_times` keeping the lower time per `(player_key, track_id)`.
   - Add placing points to `weekly_points (player_key, week_start)`.
5. Known limits of nickname keys, accepted for now: two people with the same nickname share a row, and anyone can type someone else's nickname and add to (never remove from) their row. Times still cannot be faked, because the referee decides them. A nickname that matches a seeded name is treated as a real player and the seed row is removed.
6. Failure of `record` (Postgres down, bad data) is logged and swallowed. A leaderboard fault must never delay or break a race result.

## Points

Placing among everyone on the grid, bots included: 1st 10, 2nd 7, 3rd 5, 4th 3, 5th 1, 6th 1, DNF 0. Placeholder values in `src/config/leaderboard.ts` so they are easy to tune. Weekly ties are broken by whoever reached the total first (`updated_at`).

## Data (Postgres, created with `create table if not exists` like `gem_purchases`)

- `best_times (player_key text, name text, track_id text, time_ms int, vehicle text, set_at timestamptz, is_seed bool default false, primary key (player_key, track_id))`
- `weekly_points (player_key text, name text, week_start date, points int, updated_at timestamptz, is_seed bool default false, primary key (player_key, week_start))`
- Seed rows use the same tables with `is_seed = true` and a normal nickname key.

## API (room server)

- `GET /leaderboard/weekly?name=<nickname>` returns the top 50 for the current week, last week's winner, and the named player's row and rank.
- `GET /leaderboard/times?track=<id>&name=<nickname>` returns the top 50 for a track and the named player's row.
- Both cache the response for 30 seconds in memory. The client fetches once when the overlay opens and does not poll.

## Seeds

- `scripts/seed-leaderboard.ts` inserts seeded rows with `is_seed = true`: Naija-flavoured nicknames, weekly points spread across a believable range, and for each track a time inside a band computed from the track length and the vehicles' top speeds (not random numbers).
- Reads merge seeds with real rows and sort together. A seeded row is hidden once a board has 20 or more real entries, and a real row that beats a seeded time simply outranks it.
- Seeds never earn coins or Gems, never appear in rooms, and are all removed by `delete ... where is_seed`.
- Honesty note: seeded players on a board real people are climbing is a deliberate product choice, made by the owner, and kept temporary and removable for that reason. They are not the same as the disguised Quick race bots (those are live in the race and earn nothing).

## Error handling

- Postgres unavailable: boards return an empty list with a flag, the overlay shows "Leaderboard no dey available now", the game is unaffected.
- A cheating claim never reaches `record`: a finish the referee refused makes the car DNF and DNF is never recorded.

## Testing (Vitest, beside the server tests)

- Store keeps the lower time and ignores a slower one; weekly points accumulate.
- Week start computed in Lagos time across the Sunday/Monday boundary.
- Bots and DNFs are skipped; friends' rooms never record; nickname keys are normalised (case, spaces).
- Seeds hide at 20 real rows, and a real faster time outranks a seed.
- Points table and tie-break.
- A record failure does not stop results being sent.
- UI: icon shows only on the Multiplayer main card, opens the overlay, and pins the player's own row when they are outside the top 50. Check at a phone viewport, in landscape and in the turned-CSS mode (`.app[data-rotated]`).

## Not in this spec

Account-linked entries (Clerk), live rank pushed after a race, friends-only boards, per-vehicle boards, a Gem reward for the weekly winner, validating single-player or campaign earnings, and anything for friends' rooms.
