# Account Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in player's progress is saved to their account and follows them to any phone; the account's save wins on conflict.

**Architecture:** A pure shared module decides what syncs and who wins. The existing Node room server gains `GET`/`PUT /save` backed by Postgres and a Clerk-verified token, with a revision number for conflicts. The client gets a small sync engine (debounced push, pull on sign-in) wired to the zustand store, rendered only when Clerk is enabled.

**Tech Stack:** TypeScript, vitest, Node `http`, `pg`, `@clerk/backend`, `@clerk/react` (`useAuth`), zustand.

**Spec:** `docs/superpowers/specs/2026-10-05-account-sync-design.md`

## Global Constraints

- The game must run with no account and with no `VITE_CLERK_PUBLISHABLE_KEY` (`AUTH_ENABLED` false: nothing sync-related renders or runs).
- Never expose `CLERK_SECRET_KEY` to client code. Do not read or print `.env*` files.
- Synced fields: coins, premium, best, races, vehicle, driver, track, unlocked, upgrades, paint, ownedPaints, adViews, campaign, roomEarned. Per-device, never synced or overwritten: settings, accountPromptDismissed, itemHints.
- Account wins: a cloud save replaces local synced fields. Backup of the replaced local save goes to localStorage key `lagos-racer:v2:backup` (one slot).
- Push debounce 3000 ms; a race end pushes immediately. Body cap 64 KB. No `DATABASE_URL`: `/save` returns 503, rooms unaffected.
- Server does not validate that earnings are honest (out of scope).
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- First sign-in on a phone with real progress while the account holds an *empty* cloud save (races 0): expect local uploaded, not wiped (refinement of the spec, see Task 1).
- A brand-new phone with no progress signing in to a new account: expect no pointless empty upload overwriting later.
- Token expires mid-session: expect a fresh token per request (call `getToken` each time), never a cached one.
- Sign-out while a debounced push is pending: expect the push cancelled, local progress untouched.
- Server restart or Postgres down: expect 503/500 to the client, status "offline", game unaffected, rooms unaffected.

## File Structure

- Create `src/game/syncSave.ts`: pure, shared by client and server. `SYNCED_KEYS`, `pickSynced`, `mergeRemote`, `decideSignIn`, `hasProgress`.
- Create `server/saves.ts`: `SaveStore` interface, `MemorySaveStore`, `PgSaveStore`, `handleSaveRequest`.
- Modify `server/index.ts`: route `/save`, CORS, wire store and token verifier.
- Create `src/game/sync.ts`: client sync engine (no React).
- Create `src/ui/SyncManager.tsx`: Clerk hook + engine lifecycle + status chip.
- Modify `src/game/store.ts`: `applyRemoteSave` action, save listener.
- Modify `src/ui/Menu.tsx`, `src/main.tsx`: mount.
- Modify `.env.example`, `CLAUDE.md` (Accounts section).

---

### Task 1: Shared sync rules

**Files:**
- Create: `src/game/syncSave.ts`
- Test: `src/game/syncSave.test.ts`

**Interfaces:**
- Consumes: `Saved`, `normaliseSave`, `defaultSave` from `src/game/save.ts`.
- Produces:
  - `SYNCED_KEYS: readonly (keyof Saved)[]`
  - `type SyncedSave = Omit<Saved, 'settings' | 'accountPromptDismissed' | 'itemHints'>`
  - `pickSynced(s: Saved): SyncedSave`
  - `normaliseSynced(raw: unknown): SyncedSave` (runs `normaliseSave` on an object, then `pickSynced`; non-objects give defaults picked)
  - `mergeRemote(local: Saved, remote: SyncedSave): Saved` (remote synced fields over local; local `settings`, `accountPromptDismissed`, `itemHints` kept)
  - `hasProgress(s: Pick<Saved, 'races' | 'coins' | 'premium'>): boolean` (`races > 0 || coins > 0 || premium > 0`)
  - `decideSignIn(local: Saved, remote: SyncedSave | null): 'upload' | 'download' | 'none'`

- [ ] **Step 1: Write failing tests** in `syncSave.test.ts`:
  - `pickSynced` has no `settings`, `accountPromptDismissed`, `itemHints` keys and has `roomEarned`.
  - `mergeRemote` keeps local `settings.quality` and `itemHints`, takes remote `coins`.
  - `decideSignIn`: remote null + local progress → `upload`; remote null + no local progress → `none`; remote with progress → `download`; remote empty (races 0, coins 0, premium 0) + local progress → `upload`; remote empty + local empty → `none`.
  - `normaliseSynced({coins: -5, junk: 1})` has `coins` not negative-infinite and no `junk` key (use `expect(Object.keys(...))` against `SYNCED_KEYS`).
- [ ] **Step 2: Run** `npx vitest run src/game/syncSave.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the functions above. `decideSignIn` is the account-wins rule with one refinement over the spec: a remote with no progress counts as "no cloud save", so an empty cloud save never wipes a phone that has progress.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `git add src/game/syncSave.ts src/game/syncSave.test.ts && git commit -m "Add shared sync rules"` (with trailer).

---

### Task 2: Save routes on the server

**Files:**
- Create: `server/saves.ts`
- Test: `server/saves.test.ts`
- Modify: `package.json` (`pg`, `@clerk/backend` dependencies; `@types/pg` dev) via `npm install pg @clerk/backend && npm install -D @types/pg`

**Interfaces:**
- Consumes: `normaliseSynced`, `SyncedSave` from `src/game/syncSave.ts`.
- Produces:
  - `interface SaveStore { get(userId: string): Promise<{ data: SyncedSave; rev: number } | null>; putIfRev(userId: string, data: SyncedSave, expectedRev: number): Promise<{ ok: true; rev: number } | { ok: false; current: { data: SyncedSave; rev: number } | null }> }`
  - `class MemorySaveStore implements SaveStore`
  - `class PgSaveStore implements SaveStore` (constructor takes `pg.Pool`; `ensureSchema(): Promise<void>` creates `saves(user_id text primary key, data jsonb not null, rev integer not null, updated_at timestamptz not null default now())`; `putIfRev` with expectedRev 0 is `INSERT ... ON CONFLICT DO NOTHING RETURNING rev`, otherwise `UPDATE ... SET rev = rev + 1 WHERE user_id = $1 AND rev = $3 RETURNING rev`; no returned row means conflict, then re-read current)
  - `type SaveDeps = { store: SaveStore | null; verify: (token: string) => Promise<string | null>; allowedOrigins: string[] }` (`verify` returns the user id or null)
  - `handleSaveRequest(req: IncomingMessage, res: ServerResponse, deps: SaveDeps): Promise<void>`: handles `OPTIONS` (204 plus CORS headers for an allowed origin), `GET` (200 `{data, rev}` or 404), `PUT` (body `{data, rev}`; 200 `{rev}`, 409 `{data, rev}`), 401 for a missing or bad bearer token, 503 when `store` is null, 413 over 64 KB, 400 for bad JSON or non-number `rev`. CORS headers (`Access-Control-Allow-Origin` echoing an allowed origin, `Allow-Headers: Authorization, Content-Type`, `Allow-Methods: GET, PUT, OPTIONS`) on every response when the origin is allowed.

- [ ] **Step 1: Write failing tests** in `saves.test.ts` against a real `http.createServer` on port 0 using `fetch`, with `MemorySaveStore` and a fake `verify` (`'tok-a'` → `'user-a'`, `'tok-b'` → `'user-b'`, else null):
  - 401 with no header and with a bad token.
  - GET before any save → 404; PUT `{data: {coins: 50}, rev: 0}` → 200 `{rev: 1}`; GET → `data.coins === 50`, `rev === 1`.
  - PUT with `rev: 0` again → 409 and body has `rev: 1`.
  - Two users are isolated (`user-b` GET → 404).
  - PUT `{data: {coins: -9}, rev: 1}` stores a normalised value (coins not negative via `normaliseSave` rules: check GET `data.coins >= 0`).
  - Body over 64 KB → 413.
  - `store: null` → 503 on GET.
  - OPTIONS from an allowed origin → 204 with `Access-Control-Allow-Origin`; from a disallowed origin → no such header.
- [ ] **Step 2: Run** `npx vitest run server/saves.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `server/saves.ts` per the interfaces. Read the body with a running byte count and abort past 64 KB. `PgSaveStore` is not unit-tested here (needs a database); keep its SQL small and covered by the manual check in Task 5.
- [ ] **Step 4: Run** the same command. Expected: PASS. Then `npm run typecheck`. Expected: clean (this also proves `server/tsconfig.json` can import `src/game/save.ts` transitively; if it fails on a DOM or `import.meta.env` use, fix at the import site, not by loosening the config).
- [ ] **Step 5: Commit** `server/saves.ts server/saves.test.ts package.json package-lock.json`.

---

### Task 3: Wire `/save` into the server

**Files:**
- Modify: `server/index.ts` (the `http` request handler, lines 22-28)

**Interfaces:**
- Consumes: `handleSaveRequest`, `PgSaveStore` from Task 2; `verifyToken` from `@clerk/backend`.
- Produces: env vars `DATABASE_URL`, `CLERK_SECRET_KEY`, `ALLOWED_ORIGIN` (comma-separated; localhost origins `http://localhost:5173` and `http://localhost:5174` always allowed).

- [ ] **Step 1: Implement**: build `store` only when `DATABASE_URL` is set (`new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } })`, then `await ensureSchema()` inside `guard`-style error handling that logs and leaves `store` null on failure). Build `verify` as: no `CLERK_SECRET_KEY` → always null; else `verifyToken(token, { secretKey })` returning `payload.sub`, catching errors to null. Route `req.url === '/save'` (path only, ignore query) to `handleSaveRequest`; keep `/health` and 404 as is. Never let a `/save` error crash the process: wrap in `.catch` that writes 500 if headers are not sent.
- [ ] **Step 2: Verify** `npm run typecheck` and `npx vitest run server` pass. Then start the server with `npm run server` (no env) and check `curl -i localhost:8787/save` returns 401 and `/health` still returns ok.
- [ ] **Step 3: Commit** `server/index.ts`.

---

### Task 4: Client sync engine

**Files:**
- Create: `src/game/sync.ts`
- Test: `src/game/sync.test.ts`

**Interfaces:**
- Consumes: `decideSignIn`, `pickSynced`, `SyncedSave` from Task 1.
- Produces:
  - `type SyncStatus = 'idle' | 'syncing' | 'saved' | 'offline'`
  - `type SyncDeps = { baseUrl: string; getToken: () => Promise<string | null>; fetch: typeof fetch; getLocal: () => Saved; applyRemote: (remote: SyncedSave) => void; onStatus: (s: SyncStatus) => void; debounceMs?: number }` (`debounceMs` default 3000)
  - `createSync(deps: SyncDeps): { start(): Promise<void>; schedulePush(): void; flush(): Promise<void>; stop(): void }`
  - `syncBaseUrl(): string`: `VITE_ROOM_SERVER` with `wss://`→`https://` and `ws://`→`http://`, else `http://${location.hostname}:8787`.
- Behaviour: `start()` GETs `/save`, then runs `decideSignIn`: `download` calls `applyRemote` (the store handles backup) and remembers `rev`; `upload` PUTs with the remembered `rev` (0 when 404); `none` just remembers `rev`. No push is allowed before `start()` has succeeded. A 409 reply calls `applyRemote` with the returned data and updates `rev`. Network failure or non-2xx: status `offline`, keep a dirty flag, retry on the next `schedulePush`/`flush` and on `window` `online` event. `getToken` is called per request; a null token means status `idle` and no request. `stop()` clears the timer and ignores in-flight results.

- [ ] **Step 1: Write failing tests** with a fake `fetch` (in-memory server logic: map of user → `{data, rev}`), vitest fake timers:
  - `start()` with 404 and local progress → one PUT with `rev: 0`, status `saved`.
  - `start()` with remote progress → `applyRemote` called with remote data, no PUT.
  - Remote empty + local progress → PUT (the Review Focus case).
  - Three `schedulePush()` calls within 1 s → exactly one PUT after 3000 ms; `flush()` pushes at once without waiting.
  - 409 reply → `applyRemote` called with returned data, no retry loop.
  - `fetch` rejects → status `offline`; the next `flush()` retries and reaches `saved`.
  - `schedulePush()` before `start()` has finished → no PUT.
  - `stop()` with a pending debounce → no PUT afterwards.
  - `getToken` returns a different token on each call and the requests use the latest (assert on the `Authorization` header of two PUTs).
- [ ] **Step 2: Run** `npx vitest run src/game/sync.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `createSync` per the behaviour above.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `src/game/sync.ts src/game/sync.test.ts`.

---

### Task 5: Store, UI and docs

**Files:**
- Modify: `src/game/store.ts` (action near `dismissAccountPrompt`, line 204; `save()` at line 207)
- Create: `src/ui/SyncManager.tsx`
- Modify: `src/ui/Menu.tsx` (next to `<AuthControls />`, line 56), `src/main.tsx`, `.env.example`, `CLAUDE.md` (Accounts section)
- Test: `src/game/store.sync.test.ts`

**Interfaces:**
- Consumes: `createSync`, `syncBaseUrl`, `SyncStatus` (Task 4); `mergeRemote` (Task 1); `useAuth` from `@clerk/react` (`isSignedIn`, `getToken`).
- Produces:
  - store action `applyRemoteSave(remote: SyncedSave): void`: writes the current full local save to `lagos-racer:v2:backup`, sets the store to `mergeRemote(local, remote)` (synced fields only; per-device fields untouched), then calls `save()`.
  - `onSaved(listener: () => void): () => void` exported from `store.ts`: `save()` calls every listener after `writeSave`; returns an unsubscribe function.
  - `<SyncManager />`: renders nothing when `!AUTH_ENABLED`; when signed in, creates the engine, calls `start()`, subscribes `schedulePush` via `onSaved`, flushes when `finishRace` has just run (listen on `useGame` for `results` changing to non-null), `stop()` and unsubscribes on sign-out or unmount. Renders the status chip: "Saved to your account" / "Syncing" / "Offline, will retry"; nothing for `idle`.

- [ ] **Step 1: Write failing tests** in `store.sync.test.ts` (reset the store and `localStorage` between tests):
  - `applyRemoteSave({...remote, coins: 900})` sets `coins` to 900, leaves `settings.quality` and `itemHints` unchanged.
  - The previous local save is in `localStorage['lagos-racer:v2:backup']`.
  - `onSaved` listener fires once after a store action that saves (use `dismissAccountPrompt`), and not after unsubscribe.
- [ ] **Step 2: Run** `npx vitest run src/game/store.sync.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the store action and `onSaved`; then `SyncManager` and its mount (inside `ClerkProvider` in `main.tsx`; chip in `Menu.tsx` inside `.menu-corner`, styled in `src/styles.css` as a small muted line that does not shift the layout on a 667x375 viewport).
- [ ] **Step 4: Update docs**: `.env.example` gets commented lines for `DATABASE_URL`, `CLERK_SECRET_KEY`, `ALLOWED_ORIGIN` (server side) and `VITE_CLERK_PUBLISHABLE_KEY`; rewrite the CLAUDE.md "Accounts" section to say sign-in is Clerk, progress syncs to Postgres through the room server, account wins, and link both spec and plan.
- [ ] **Step 5: Verify**: `npm run typecheck`, `npm test` (all pass), then in the browser preview at a 667x375 viewport confirm the menu still fits with the chip and no console errors. Real sign-in and the two-profile conflict check need the user's Clerk test account and a Postgres `DATABASE_URL`: hand those steps to the user with the list in the spec's "Setup the user must do".
- [ ] **Step 6: Commit** all changed files.
