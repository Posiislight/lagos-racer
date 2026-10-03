# Lagos Racer

A comedic Lagos kart racer for the browser: okadas, kekes, danfos and BRTs racing through the tight, hilly streets of Ojuelegba, throwing juju, spilling crude oil and dodging goats.

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
| `npm test` | Unit tests (track projection, lap counting, standings) |
| `node scripts/sync-models.mjs` | Re-import the vehicle models after changing the showroom in `reference/sporty/` |
| `node scripts/track-report.ts ojuelegba out.svg` | Check a track layout: length, tightest bend, overlapping sections, top-down SVG |
| `node scripts/playtest.mjs --gpu --autopilot --seconds=30` | Headless play-test with screenshots and a log of positions, speeds and FPS (dev server must be running) |

Handy URL flags: `?unlock=all` opens the locked BRTs, `?autopilot=1` lets the AI drive your vehicle.

## Multiplayer (local)

Racing with friends needs the room server running next to the game:

```bash
npm run server   # room server on port 8787 (set PORT to change it)
npm run dev      # the game, as above
```

Phones on the same Wi-Fi reach the server through the laptop's address: the game connects to `ws://<the address you opened>:8787`, so open the "Network" address Vite prints on each phone and it finds the server by itself. Set `VITE_ROOM_SERVER` to point at a server somewhere else. Friends can join straight from a link ending in `?room=CODE`. The online menu is coming; the server is the only part in place so far.

## Controls

You're always on the gas: just steer. Hitting walls or other vehicles costs you speed, and if
you get stuck nose-first the vehicle backs itself out.

| | Keyboard | Phone |
|---|---|---|
| Steer | ← → or A D | ◀ (left thumb) and ▶ (right thumb), or tilt the phone (Settings) |
| Use item | E, F or Shift | USE button, or tap the item circle at the top |
| Horn | H | PON PON |
| Brake / reverse (optional) | ↓ or S | – |
| Pause | Esc or P | II button |

Items float over the road as icons, so you can steer into the one you want:
**fuel** (speed boost), **crude oil** (drop it behind you; whoever drives over it goes slippery),
**juju** (flies to the racer ahead of you and slows them down).

## How it's built

- **Vite + React + TypeScript**, **React Three Fiber** for 3D, **Rapier** (raycast vehicle controller) for physics, **zustand** for UI state.
- `src/config/vehicles.ts` has every vehicle's stats, size and handling tuning in one place. `src/config/tracks.ts` defines tracks as a loop of control points, gentle hills and scenery zones; the road, kerbs, pavements, colliders, racing line, pickups, goats and the street of buildings are all generated from that.
- `src/scene/art/` paints the Lagos look into textures: building fronts, cut-out crowds, the skyline, pavements and zinc.
- `src/models/` builds the vehicles from the procedural showroom code (`reference/sporty/`), merging static parts per material so each vehicle draws in a few dozen calls.
- `src/game/` is plain logic: track maths, lap counting, AI, items, input, audio (all sound is synthesised, so there are no audio downloads).
- `src/scene/` holds the 3D pieces: vehicle physics, track, scenery, chase camera, effects, race loop.
- `src/ui/` holds the menus, garage, HUD and touch controls.
- The race code (three.js, physics, models) loads only when you start a race, so the menu appears quickly on mobile data.

## Reference

- `reference/vehicle-showroom.html`: the original approved vehicle concepts.
- `reference/vehicle-showroom-sporty.html`: the sporty race-build versions used in the game (built from `reference/sporty/` with `node reference/sporty/build.mjs`).
