# Account sync (cloud save) design

Date: 5 October 2026. Status: draft for review.

## Goal

A signed-in player's progress follows them to any phone. Playing with no account still works exactly as today. Clerk sign-up and sign-in are already built (commit `118f612`); this spec adds saving progress to the account.

## Decisions (from the user)

- **Account wins.** When someone signs in and the account already has a cloud save, the cloud save replaces this phone's local progress.
- Auth is Clerk. The game must keep working with no Clerk key and no account.

## Behaviour

**Signing in on a phone**
- Account has no cloud save yet: upload this phone's progress as the account's first save. (This is the normal "play two races, then sign up" path, so no progress is lost.)
- Account has a cloud save: replace local progress with it. First copy the replaced local save to `lagos-racer:v2:backup` (one slot, overwritten each time) so a surprise can be undone by hand.

**While signed in**
- Every local save is also pushed to the cloud, debounced to about 3 seconds, and pushed immediately when a race ends.
- On app start (when already signed in) the phone pulls the account's save first.
- A sync indicator in the menu: "Saved to your account", "Syncing", or "Offline, will retry".

**Two devices**
- The server keeps a revision number (`rev`) per save. A push carries the `rev` the phone last saw.
- If it does not match the server's `rev`, the server rejects the push (409) and returns the current save. The phone replaces its local progress with it. Same rule as sign-in: the account wins, so progress made on a stale phone can be lost.

**Failures**
- Offline or server errors never block play. The save stays local and is retried on the next change, on app start, and when the browser comes back online.

**Signing out**
- Local progress stays on the phone. Nothing is deleted. The next sign-in follows the rules above.

## What syncs

Everything in `Saved` (`src/game/save.ts`) except per-device fields:

| Synced | Stays on the phone |
|---|---|
| coins, premium, best, races, vehicle, driver, track, unlocked, upgrades, paint, ownedPaints, adViews, campaign, roomEarned | settings (quality, sound, steering, invertTilt, showFps), accountPromptDismissed, itemHints |

`roomEarned` must sync so the ₦300,000 daily room cap cannot be reset by switching phones.

When a cloud save is applied, the local per-device fields are kept and only the synced fields are replaced.

## Server

Lives in the existing Node server (`server/index.ts`, same Railway service as the rooms). No second backend.

- Storage: Postgres on Railway, table `saves(user_id text primary key, data jsonb not null, rev integer not null, updated_at timestamptz not null)`. The Railway service has no persistent disk, so a file store is not an option. The server reads `DATABASE_URL`; with it unset, `/save` returns 503 and the rooms are unaffected.
- `GET /save` returns `{ data, rev }`, or 404 when the account has none.
- `PUT /save` takes `{ data, rev }`. For a new account `rev` is 0. It stores `data` and returns the new `{ rev }`, or 409 with `{ data, rev }` on a mismatch. The check and the write are one SQL statement (`... WHERE rev = $expected`), so two phones cannot both win.
- Auth: `Authorization: Bearer <Clerk session token>`, verified with `@clerk/backend` (`verifyToken`) using `CLERK_SECRET_KEY` set on Railway. The user id is the token's `sub`. A missing or invalid token returns 401.
- Validation: body size capped (64 KB); `data` goes through the existing `normaliseSave` (shared with the client, imported from `src/game/save.ts`) so bad shapes and negative numbers are dropped. Only the synced fields are stored.
- CORS: allow the Vercel site origin (env `ALLOWED_ORIGIN`, plus localhost in dev) and handle `OPTIONS`.
- **Not in this spec:** checking that naira, stars or times were earned honestly. A player can edit their own save today and still can. Server-side score validation belongs with the leaderboard.

## Client

- `src/game/sync.ts`:
  - A pure function `decideSignIn(local, remote)` returning `upload`, `download` or `none` (this carries the account-wins rule).
  - `mergeRemote(local, remote)`: the remote synced fields over the local per-device fields.
  - The fetch, debounce and retry logic, with the network call injected so it is testable.
- A small React component (inside `ClerkProvider`, rendered only when `AUTH_ENABLED`) that watches the signed-in state, gets the token with Clerk's `getToken`, and starts and stops the sync.
- Hook into the store's existing `save()` path so each local save schedules a push; a race end flushes immediately.
- `VITE_ROOM_SERVER` already points at the server (as `wss://`); the HTTP base URL is derived from it (`https://`).
- Menu indicator next to `AuthControls`.

## Testing

- Unit tests: `decideSignIn` (all four local/remote combinations), `mergeRemote` (per-device fields kept), debounce and flush, retry on failure, 409 handling.
- Server tests: with a fake token verifier and an in-memory store: 401 without a token, 404 then 200 round trip, 409 on a stale `rev`, size cap, invalid shape normalised.
- Manual: sign in on two browser profiles against a local Postgres; check first-sign-in upload, cloud-wins download, and the stale-phone case. Check on a mobile viewport.

## Setup the user must do

- Create a Postgres database on Railway and link it to the room server service (gives `DATABASE_URL`).
- Set `CLERK_SECRET_KEY` and `ALLOWED_ORIGIN` on Railway.
- Add `VITE_CLERK_PUBLISHABLE_KEY` to Vercel, and move to a production Clerk instance before launch (only a development instance exists now).

## Out of scope

Server-side score and anti-cheat validation, the leaderboard, using the account name in multiplayer rooms, merging two progress states field by field, and deleting an account's cloud save.
