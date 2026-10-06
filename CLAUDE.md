# Lagos Racer (working title)

A comedic, Lagos-themed 3D kart racer that runs in the browser, in the style of Beach Buggy Racing. Players race Lagos vehicles through exaggerated versions of real Lagos spots and fight with Naija power-ups.

## Reference material

- `reference/vehicle-showroom.html` is the approved concept for the vehicles and art direction. It is a single-file Three.js (r128) page with procedural models for all five vehicles and the characters. Open it in a browser to see them. The builder functions (`buildOkada`, `buildKeke`, `buildDanfo`, `buildBRT`, `person`) can be ported into React Three Fiber components as placeholder models until real GLB models exist.
- `reference/photos/` has the real-world vehicles the models are based on: okada (red street bike), keke (yellow three-wheeler), danfo (yellow bus with two black stripes), BRT (white-and-blue city bus).

## Tech stack

- Vite + React + TypeScript
- React Three Fiber (`@react-three/fiber`) with `@react-three/drei`
- Physics: Rapier via `@react-three/rapier`, using its raycast vehicle controller for car-style driving
- Menus, garage and leaderboard are normal React UI layered over the canvas
- Installable PWA, deployed on Vercel
- Multiplayer room server: Node + TypeScript WebSocket server in `server/` (plain `ws`), sharing track and lap code with the client, hosted on Railway
- Later: backend in FastAPI or Django for accounts, coins and leaderboard. Validate scores on the server (reject physically impossible lap times).

## Performance budget

Most players will be on budget Android phones (Tecno, Infinix) on mobile data.
- Low-poly models, compressed (Draco or meshopt for geometry, KTX2 for textures)
- Baked lighting where possible; keep real-time shadows to one directional light, low resolution
- Short, enclosed tracks; never render a whole city
- A quality setting (low/medium/high, or Auto). The default is High, with Auto off. Picking Auto starts on high (medium on a clearly weak phone) and steps down one level when the frame rate stays under 40 for three one-second windows in a row; it never steps back up. Tunables and what each level means are in `src/game/adaptiveQuality.ts`; the scene reads the level from `settings.quality`. `?debug=1` shows an FPS and renderer-stats overlay.
- Keep the initial download small; lazy-load tracks and vehicles

## Art direction

- Smooth, rounded, glossy shapes with bright saturated colours. Clean like Beach Buggy Racing, not blocky like Roblox.
- Characters: big heads, big eyes, smooth limbs, cartoon proportions.
- Every vehicle must read as unmistakably Nigerian: Lagos commercial plates, stickers and slogans ("No Food For Lazy Man", "Shine Your Eye", "No Condition Is Permanent"), ankara seat covers, handlebar tassels, rust patches, loaded roof racks, Ghana Must Go bags, gele.
- Doors and kerb side on the right (Nigeria drives on the right); drivers sit on the left.
- No real brand logos (TVS, Bajaj, VW). Use invented badges such as "OGA" and "KABIYESI".
- No real celebrity names or likenesses. Parody characters only (e.g. "Odogwu Rider", "Starboy-ish").

## Vehicles (placeholder stats out of 10)

| Vehicle | Speed | Handling | Toughness | Notes |
|---|---|---|---|---|
| Okada | 9 | 9 | 2 | Rider in union vest, side-saddle passenger |
| Keke Marwa | 5 | 6 | 4 | Tips on corners, overloaded with passengers |
| Danfo | 6 | 5 | 7 | Conductor fires the power-ups |
| BRT | 4 | 3 | 10 | Slow tank, unlockable "boss" vehicle |

**Gems** (the premium currency, `src/config/premium.ts`): a rewarded ad in the Menu's Get Gems dialog pays `AD_GEMS` (5), and ₦500 buys 100 Gems through Paystack (`GEM_PACKS`). A signed-in player taps Buy in the Get Gems dialog; `POST /pay/init` on the room server (`server/paystack.ts`) starts a Paystack checkout priced from the pack table, and the player comes back with `?reference=`. `GET /pay/verify` and the signed `POST /pay/webhook` credit a payment once per reference into the `gem_purchases` table (amount, currency and owner are checked). The phone then adds `total − gemsClaimed` to `premium` (`claimPurchasedGems`, `src/ui/purchases.ts`), so a retry or a second device never double-credits. Needs `PAYSTACK_SECRET_KEY` on the server (test key first) and the webhook URL set in the Paystack dashboard. Spending Gems is still client-side, so the balance can be edited on the phone; a server-side wallet comes with the leaderboard work. Not built: earning a Gem for a ★★★ finish.

Colours are paint options, not separate vehicles: each vehicle has six paints in the garage (see `src/config/vehicles.ts`). The default paint is yellow on every vehicle except the BRT (white-and-blue); every other paint costs premium currency, bought with real money later (placeholder values in `src/config/premium.ts`). The BRT unlocks by watching a rewarded ad or paying ₦1,000,000 of naira (`locked` in `vehicles.ts`; ads go through `src/game/ads.ts`). Spec `docs/superpowers/specs/2026-10-05-premium-currency-design.md`.

Danfo and BRT have conductors hanging out of the door; on those vehicles the conductor throws the power-ups.

### Drivers

The driver is picked separately from the vehicle (Garage, saved) and sits in every vehicle (`driverFigure` in `reference/sporty/core.js`). Each has a special power on a charge meter (30 s) and a button (Q on keyboard). Config in `src/config/drivers.ts`; logic in `src/game/specials.ts`.

- **Moshood** (angry agbero): Push Squad.
- **Mama Put** (stern food seller): Pepper Soup Trail.

## Power-ups

- Juju: bomb
- Crude oil: grease slick that makes others skid
- Odeshi: protective charm, blocks crude oil and juju for 8 seconds
- Projectile: pure water sachet or a flying slipper (not a baby)
- Push Squad (driver special): Moshood's boys shove from behind for about 4 seconds
- Pepper Soup Trail (driver special): a trail of scalding soup patches for about 5 seconds; anyone who drives through slows down and coughs

## Tracks (stylised, hand-built, not Street View)

Ojuelegba, Ikorodu Garage (built), Third Mainland Bridge, Oshodi under the bridge, flooded Lekki in rainy season, Balogun market. Hazards: LASTMA ambush, goats crossing, danfos cutting in, open gutters, potholes.

Every track has its own look, set in `src/config/tracks.ts` (`setting`: sky, haze, light, the painted horizon and, for tracks over water, the lagoon). A new track should get a different setting and different scenery, not the same buildings with a new road. Tracks are loops of hand-drawn control points; their length, bends and grades are checked by `src/config/tracks.test.ts` and `scripts/track-report.ts`.

Third Mainland Bridge is built: a hand-drawn 2.6 km journey, 2 laps (`src/config/thirdMainland.ts`). Mainland street, a ramp that climbs onto the bridge, a long span over the lagoon with the other carriageway jammed with traffic, the island end, then a low causeway through a stilt-house water village. The road's height comes from `heights` (a profile along the lap); the lagoon, deck and props are in `src/scene/lagoon.ts`.

Shortcuts are supported as data but none are placed yet: a track's `shortcuts` list gives a fork and a rejoin lap distance and the waypoints between (`src/game/shortcuts.ts`, which also checks a shortcut is shorter and doesn't hit the road). Lap counting and positions already follow a car through one. Not yet built: drawing a branch, a gap in the walls at the fork and rejoin, and the AI choosing a branch.

Every track has its own look, set in `src/config/tracks.ts` (`setting`: sky, haze, light, the painted horizon and, for tracks over water, the lagoon). A new track should get a different setting and different scenery, not the same buildings with a new road. Tracks are loops of hand-drawn control points; their length, bends and grades are checked by `src/config/tracks.test.ts` and `scripts/track-report.ts`.

Third Mainland Bridge is built: a hand-drawn 2.6 km journey, 2 laps (`src/config/thirdMainland.ts`). Mainland street, a ramp that climbs onto the bridge, a long span over the lagoon with the other carriageway jammed with traffic, the island end, then a low causeway through a stilt-house water village. The road's height comes from `heights` (a profile along the lap); the lagoon, deck and props are in `src/scene/lagoon.ts`.

Shortcuts are supported as data but none are placed yet: a track's `shortcuts` list gives a fork and a rejoin lap distance and the waypoints between (`src/game/shortcuts.ts`, which also checks a shortcut is shorter and doesn't hit the road). Lap counting and positions already follow a car through one. Not yet built: drawing a branch, a gap in the walls at the fork and rejoin, and the AI choosing a branch.

Ojuelegba is laid out on the real road from OpenStreetMap (`scripts/osm-track.mjs`, credit "© OpenStreetMap contributors" in the menu); the buildings and props stay stylised and hand-built. Never derive layouts or models from Google Maps or Street View imagery (their terms forbid it); Street View is only for looking.

**Exception, chosen by the user (4 October): the Ikorodu Garage track uses real business and place names as lettering on signs**, in brand colours, with no logo artwork (`src/config/signs/ikorodu.ts`; spec `docs/superpowers/specs/2026-10-04-ikorodu-garage-track-design.md`). Only names read off a sign are used, never names seen only on a map. This breaks the no-real-brand rule above and carries trademark risk for a deployed game with coins; the track's `signage: 'generic'` flag switches every real name off. The sign text was read in Street View, so before shipping, confirm it against the user's own photos or video.

## Accounts

Let people play straight away with no sign-up. After their first race or two, prompt them to create an account to save coins and their high score.

Sign-up and sign-in are Clerk (`src/ui/AuthControls.tsx`; the game runs with no account and with no `VITE_CLERK_PUBLISHABLE_KEY`). A signed-in player's progress syncs to a Postgres save through `GET`/`PUT /save` on the room server (`server/saves.ts`, client in `src/game/sync.ts`, shared rules in `src/game/syncSave.ts`). **The account's cloud save wins** over the phone's progress; a phone's progress only uploads when the account has no progress yet. Settings, the dismissed-prompt flag and the hint counter stay per phone. The server does not yet check that earnings are honest (leaderboard work). Spec `docs/superpowers/specs/2026-10-05-account-sync-design.md`, plan `docs/superpowers/plans/2026-10-05-account-sync.md`.

## Build order

1. Okada driving well on one simple loop track (Ojuelegba-style) with lap counting, touch controls and keyboard, chase camera. Playable on a phone.
2. Three AI opponents and race positions.
3. Two power-ups: juju bomb and crude oil slick.
4. Comedy layer: art, sounds, horn, conductor animations.
5. Accounts, leaderboard, garage (paint, stickers, horns, upgrades), more vehicles and tracks.

Milestones 1–3 are built, and milestone 4 is partly done.

**Current milestone: multiplayer, friends' private rooms** (2–6 players by room code or link, with optional AI fill). Design: `docs/superpowers/specs/2026-10-03-multiplayer-design.md`. Public matchmaking beyond Quick race is still out of scope.

**Quick race** (part of the multiplayer milestone): a public room anyone can join from the Online screen. It waits 30 s for more players, everyone votes on the track, and bots fill the grid. Bots are disguised as human players, arrive over the wait, and stay silent on voice; they earn no coins and no leaderboard entries. Spec `docs/superpowers/specs/2026-10-05-quick-race-design.md`, plan `docs/superpowers/plans/2026-10-05-quick-race.md`. Voice chat (friends' rooms only, 5 October): mic and speaker buttons in the lobby and race, WebRTC audio phone to phone with the room server only relaying setup messages (`rtc`, `src/net/voice.ts`, `src/ui/VoiceControls.tsx`). The mic is off until pressed. A TURN relay is supported and set at build time through `VITE_TURN_URL` (comma-separated `turn:`/`turns:` urls), `VITE_TURN_USER` and `VITE_TURN_CREDENTIAL` (Metered; set in Vercel production and `.env.local`); without them it is STUN only and phones behind carrier NAT often cannot connect. Links that stall for 10 s are retried; `?debug=1` logs each link's state and candidate types (`relay` means TURN works) and the lobby note shows "Connected to X of Y". Quick rooms have no voice yet.

**Single-player campaign** (started on 4 October at the user's request, separate from the multiplayer milestone): Chapter 1 is four races, two per map (Ojuelegba, Ikorodu Garage): a normal race, a normal race, an elimination race (LASTMA clamps whoever is last on a timer), and a hard 1-on-1 duel with Mama Put. Finishing the duel unlocks Mama Put as a playable driver; she stays locked in the Garage until `campaign-1-4` is cleared. Config in `src/config/campaign.ts`, rules in `src/game/campaign.ts`, race modes in `src/game/modes.ts`, race setup in `src/game/setup.ts`. In the campaign only the duel's AI (Mama Put) uses its driver special. Spec `docs/superpowers/specs/2026-10-04-campaign-design.md`, plan `docs/superpowers/plans/2026-10-04-campaign.md`, GitHub issue #4.

**Audio** (5 October): no musical soundtrack; a looping Lagos street ambience plays in races. Every sound is synthesised in `src/game/audio.ts` and can be replaced by a recording in `public/audio/` (names and volumes in `src/config/sounds.ts`, file list in `public/audio/README.md`); a missing file falls back to synth. A juju aimed at the player hums louder as it closes in (`src/game/warnings.ts`). Spec `docs/superpowers/specs/2026-10-05-audio-design.md`.

**Stars and naira** (spec `docs/superpowers/specs/2026-10-05-menu-stars-economy-design.md`): races pay by the stars earned in that run, every time: 1st ★★★ = ₦100,000, 2nd ★★ = ₦60,000, 3rd ★ = ₦30,000, nothing below 3rd (the duel overrides to win = ★★★ only). Best stars per race are saved (`campaign.stars`); a race counts as passed with at least one star. Only race 1 starts open; each next race opens when the one before is passed. Room races pay half with a ₦300,000 daily cap (`src/config/economy.ts`). The main menu has only two entries, Single player and Multiplayer (no quick race), with Garage and Settings as small icon buttons. Phones play in landscape: the fullscreen tap asks the browser to lock it, and where that fails (in-app browsers, rotation lock) a touch device held upright gets the whole app turned 90° in CSS (`.app[data-rotated]`, `useFakeLandscape` in `src/ui/RotatePrompt.tsx`, point mapping in `src/ui/rotate.ts`), so no prompt and no pause. Code that reads screen pointer positions or `getBoundingClientRect` inside the app must map through `toLocalPoint`; the race canvas sizes from `offsetSize`. In-app browsers (Instagram, TikTok, Facebook...) get an "Open in Chrome" banner on the menu (`src/ui/InAppBrowserBanner.tsx`, `inAppBrowser.ts`). Tilt steering is unchanged (an upright phone reads gamma); its feel in turned mode is untested on a real phone.

**First-time onboarding**: a four-card how-to (drive, power-ups, special, podium) shows over the main menu to a player with no races or campaign progress (`src/ui/HowToRace.tsx`, copy and rules in `src/game/onboarding.ts`); wording follows keys or touch. Skip or finish sets `onboarded` (per phone, not synced). The "?" button on the menu reopens it.

Do not start a later milestone until the earlier one feels fun.

The room server deploys to Railway (`railway.json`); the Vercel site points at it through `VITE_ROOM_SERVER`.

## Working style

- Plan before implementing each milestone and confirm the plan with me.
- Keep components small; vehicle definitions (stats, model, handling tuning) should live in one config file so tuning is easy.
- Test on a mobile viewport, not just desktop.
