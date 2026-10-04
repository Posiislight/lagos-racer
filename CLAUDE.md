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
- A quality setting (low/medium/high)
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

Colours are paint options, not separate vehicles: each vehicle has six paints in the garage (see `src/config/vehicles.ts`).

Danfo and BRT have conductors hanging out of the door; on those vehicles the conductor throws the power-ups.

## Power-ups

- Juju: bomb
- Crude oil: grease slick that makes others skid
- Odeshi: protective charm, blocks crude oil and juju for 8 seconds
- Projectile: pure water sachet or a flying slipper (not a baby)

## Tracks (stylised, hand-built, not Street View)

Ojuelegba, Third Mainland Bridge, Oshodi under the bridge, flooded Lekki in rainy season, Balogun market. Hazards: LASTMA ambush, goats crossing, danfos cutting in, open gutters, potholes.

Ojuelegba is laid out on the real road from OpenStreetMap (`scripts/osm-track.mjs`, credit "© OpenStreetMap contributors" in the menu); the buildings and props stay stylised and hand-built. Never derive layouts or models from Google Maps or Street View imagery (their terms forbid it); Street View is only for looking.

## Accounts

Let people play straight away with no sign-up. After their first race or two, prompt them to create an account to save coins and their high score.

## Build order

1. Okada driving well on one simple loop track (Ojuelegba-style) with lap counting, touch controls and keyboard, chase camera. Playable on a phone.
2. Three AI opponents and race positions.
3. Two power-ups: juju bomb and crude oil slick.
4. Comedy layer: art, sounds, horn, conductor animations.
5. Accounts, leaderboard, garage (paint, stickers, horns, upgrades), more vehicles and tracks.

Milestones 1–3 are built, and milestone 4 is partly done.

**Current milestone: multiplayer, friends' private rooms** (2–6 players by room code or link, with optional AI fill). Design: `docs/superpowers/specs/2026-10-03-multiplayer-design.md`. Public matchmaking is still out of scope.

Do not start a later milestone until the earlier one feels fun.

The room server deploys to Railway (`railway.json`); the Vercel site points at it through `VITE_ROOM_SERVER`.

## Working style

- Plan before implementing each milestone and confirm the plan with me.
- Keep components small; vehicle definitions (stats, model, handling tuning) should live in one config file so tuning is easy.
- Test on a mobile viewport, not just desktop.
