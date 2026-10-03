# Lagos Racer

A comedic Lagos kart racer for the browser: okadas, kekes, danfos and BRTs racing up and down the real Ojuelegba Road, from the Tejuosho market to under the Western Avenue bridge and back, throwing juju, spilling crude oil and dodging goats.

Progress notes for review: [docs/overnight-plan.md](docs/overnight-plan.md).

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173. To play on your phone, connect it to the same Wi-Fi and open the "Network" address Vite prints.

Other commands:

| Command | What it does |
|---|---|
| `npm run build` | Typecheck and build the installable PWA into `dist/` (deploy that folder to Vercel) |
| `npm test` | Unit tests (track geometry, lap counting, standings, bumps, saves, line-up, hints) |
| `node scripts/sync-models.mjs` | Re-import the vehicle models after changing the showroom in `reference/sporty/` |
| `node scripts/track-report.ts ojuelegba out.svg` | Check a track layout: length, tightest bend, overlapping sections (the median between the two legs is allowed), top-down SVG |
| `node scripts/osm-track.mjs` | Re-derive the Ojuelegba Road layout from OpenStreetMap into `src/config/ojuelegbaAxis.ts` (only needed to change the layout) |
| `node scripts/playtest.mjs --gpu --autopilot --seconds=30` | Headless play-test with screenshots and a log of positions, speeds and FPS, plus respawns and the longest vehicle-to-vehicle contact (dev server must be running). `--vehicle=brt --paint=red`, `--eval="js"` |

Handy URL flags: `?unlock=all` opens the locked BRT, `?autopilot=1` lets the AI drive your vehicle.

## Controls

You're always on the gas: just steer. Hitting walls costs you speed; bumping another vehicle
shoves you both apart (the lighter one flies further). If you get stuck nose-first the vehicle
backs itself out.

| | Keyboard | Phone |
|---|---|---|
| Steer | ← → or A D | ◀ (left thumb) and ▶ (right thumb), or tilt the phone (Settings) |
| Use item | Space (or E, F, Shift) | The round item button, middle of the right-hand side |
| Horn | H | PON PON |
| Drift (optional) | Ctrl | – |
| Brake / reverse (optional) | ↓ or S | – |
| Pause | Esc or P | II button |

Items float over the road as icons, so you can steer into the one you want:
**fuel** (speed boost), **crude oil** (drop it behind you; whoever drives over it goes slippery),
**juju** (flies to the racer ahead of you and slows them down). The first few pickups tell you
how to use them. A boost brings speed lines and a wider view; a juju hit flashes purple; oil
smears the screen edges while you slide.

## Vehicles

Four vehicles, each with six paint colours in the garage (paint is cosmetic): **Okada** (fast,
flimsy), **Keke Marwa**, **Danfo**, and the **BRT** (slow tank, unlocks for ₦500). Six racers
are on the grid, so you will meet more than one of some vehicles, in different paint.

## The track

Ojuelegba Road as it really runs, from [OpenStreetMap](https://www.openstreetmap.org/) (road
layout © OpenStreetMap contributors, ODbL), scaled to 0.38 so a lap is about 790 m: west along the
north carriageway past the Tejuosho market, the danfos and the petrol station, the church and the
sports shops, U-turn under the Western Avenue bridge, and back east on the other side of the
median. Screenshots: `docs/screenshots/ojuelegba-road/`.

## How it's built

- **Vite + React + TypeScript**, **React Three Fiber** for 3D, **Rapier** (raycast vehicle controller) for physics, **zustand** for UI state.
- `src/config/vehicles.ts` has every vehicle's stats, size and handling tuning in one place. `src/config/tracks.ts` defines tracks as a loop of control points (Ojuelegba's come from the real road via `src/game/outAndBack.ts`), gentle hills and scenery zones; the road, kerbs, pavements, colliders, racing line, pickups, goats and the street of buildings are all generated from that.
- `src/scene/art/` paints the Lagos look into textures: building fronts, cut-out crowds, the skyline, pavements and zinc.
- `src/models/` builds the vehicles from the procedural showroom code (`reference/sporty/`), merging static parts per material so each vehicle draws in a few dozen calls.
- `src/game/` is plain logic: track maths, lap counting, AI, items, input, audio (all sound is synthesised, so there are no audio downloads).
- `src/scene/` holds the 3D pieces: vehicle physics, track, scenery, chase camera, effects, race loop.
- `src/ui/` holds the menus, garage, HUD and touch controls.
- The race code (three.js, physics, models) loads only when you start a race, so the menu appears quickly on mobile data.

## Reference

- `reference/vehicle-showroom.html`: the original approved vehicle concepts.
- `reference/vehicle-showroom-sporty.html`: the sporty race-build versions used in the game (built from `reference/sporty/` with `node reference/sporty/build.mjs`).
