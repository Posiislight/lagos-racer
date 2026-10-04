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
| `node scripts/track-report.ts ojuelegba out.svg` (or `third-mainland`, `ikorodu`) | Check a track layout: length, tightest bend, overlapping sections (the median between the two legs is allowed), top-down SVG |
| `node scripts/ikorodu-axis.mjs` | Re-derive the Ikorodu Garage centre line into `src/config/ikoroduAxis.ts` |
| `node scripts/osm-track.mjs` | Re-derive the Ojuelegba Road layout from OpenStreetMap into `src/config/ojuelegbaAxis.ts` (only needed to change the layout) |
| `node scripts/playtest.mjs --gpu --autopilot --seconds=30` | Headless play-test with screenshots and a log of positions, speeds and FPS, plus respawns and the longest vehicle-to-vehicle contact (dev server must be running). `--vehicle=brt --paint=red`, `--eval="js"` |
| `node scripts/net-race.mjs --tabs=3 [--lag=250 --jitter=80 --loss=5] [--timeout=900]` | Online race between headless tabs; exits 0 only if every tab shows identical standings. Needs the dev server on the `--url` (default `http://localhost:5175/`, e.g. `npx vite --port 5175 --strictPort`); starts and stops the room server itself |

Handy URL flags: `?unlock=all` opens the locked BRT, `?autopilot=1` lets the AI drive your vehicle.

## Multiplayer (local)

Racing with friends needs the room server running next to the game:

```bash
npm run server   # room server on port 8787 (set PORT to change it)
npm run dev      # the game, as above
```

Phones on the same Wi-Fi reach the server through the laptop's address: the game connects to `ws://<the address you opened>:8787`, so open the "Network" address Vite prints on each phone and it finds the server by itself. Set `VITE_ROOM_SERVER` to point at a server somewhere else. In the game, **Race with friends** (main menu) opens the online screen: pick a nickname, then **Create room** or type a friend's 4-letter code and **Join room**. The lobby shows the room code, a **Share** button (a link ending in `?room=CODE`, which opens the join screen with the code filled in), everyone's ride and ready ticks, and for the host a **Start** button once at least two players are ready. The nickname is remembered on the device; the connection is only opened once you create or join a room. Add `?lag=120&jitter=40&loss=3` (ms, ms, percent) to fake a bad network when testing.

## Deploying multiplayer

The site stays on Vercel; the room server runs on Railway.

1. In Railway, create a service from this repo and pick the EU West region (closest to Lagos players). `railway.json` makes it build with a no-op command and start `npm run server`, with `/health` as the health check. Railway sets `PORT` itself.
2. Generate a public domain for the service and copy it.
3. In Vercel, set the environment variable `VITE_ROOM_SERVER=wss://<domain>` (see `.env.example`) and redeploy the site, because Vite bakes it in at build time.

Troubleshooting: if the site is served over https it must use `wss://`, not `ws://`, or the browser blocks the connection.

## Controls

You're always on the gas: just steer. Hitting walls costs you speed; bumping another vehicle
shoves you both apart (the lighter one flies further). If you get stuck nose-first the vehicle
backs itself out.

| | Keyboard | Phone |
|---|---|---|
| Steer | ← → or A D | ◀ (left thumb) and ▶ (right thumb), or tilt the phone (Settings) |
| Use item | Space (or E, F, Shift) | The round item button, middle of the right-hand side |
| Horn | H | PON PON |
| Drift (optional) | C | – |
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

## The tracks

Pick a track on the main menu. Best laps are kept per track.

**Ojuelegba.** Ojuelegba Road as it really runs, from [OpenStreetMap](https://www.openstreetmap.org/) (road
layout © OpenStreetMap contributors, ODbL), scaled to 0.38 so a lap is about 790 m: west along the
north carriageway past the Tejuosho market, the danfos and the petrol station, the church and the
sports shops, U-turn under the Western Avenue bridge, and back east on the other side of the
median. Screenshots: `docs/screenshots/ojuelegba-road/`.

**Ikorodu Garage.** From General Hospital Ikorodu along Beach Road and Ayangburen Road to the garage
roundabout by the Oriwu Central Mosque, round the roundabout and back, scaled to 0.3 (a lap is
about 930 m, three laps). Road layout from OpenStreetMap (© OpenStreetMap contributors, ODbL),
re-derived with `node scripts/ikorodu-axis.mjs`. The hospital end is a constructed turning circle
(`track-report` lists it as invented). Unlike Ojuelegba, this track shows real business and place
names as lettering on signs (KFC, the mosque, and so on) because they were read off signs on the
street; set `signage: 'generic'` in `src/config/tracks.ts` to draw none of them. No logo artwork is
used.
**Third Mainland Bridge** is a different place: a hand-drawn 2.6 km journey over a lagoon, two laps. From the
mainland street up a curling ramp onto the bridge, a long sweeping span with the other carriageway jammed with
danfos, round the island end, then a low causeway through a stilt-house water village and home. Each track has
its own sky, haze and horizon (`setting` in `src/config/tracks.ts`), and this one has water. Tracks can take
shortcuts as data (`src/game/shortcuts.ts`); none are placed yet.

## How it's built

- **Vite + React + TypeScript**, **React Three Fiber** for 3D, **Rapier** (raycast vehicle controller) for physics, **zustand** for UI state.
- `src/config/vehicles.ts` has every vehicle's stats, size and handling tuning in one place. `src/config/tracks.ts` defines tracks as a loop of control points (Ojuelegba's come from the real road via `src/game/outAndBack.ts`), gentle hills and scenery zones; the road, kerbs, pavements, colliders, racing line, pickups, goats and the street of buildings are all generated from that.
- `src/config/drivers.ts` has the drivers (Moshood, Mama Put) and every number behind their special powers; `src/game/specials.ts` charges the meters and runs Push Squad and Pepper Soup Trail.
- `src/scene/art/` paints the Lagos look into textures: building fronts, cut-out crowds, the skyline, pavements and zinc.
- `src/models/` builds the vehicles from the procedural showroom code (`reference/sporty/`), merging static parts per material so each vehicle draws in a few dozen calls. `driverFigure` (in `reference/sporty/core.js`) builds the driver characters, and each vehicle builder seats whichever one you pick.
- `src/game/` is plain logic: track maths, lap counting, AI, items, input, audio (all sound is synthesised, so there are no audio downloads).
- `src/scene/` holds the 3D pieces: vehicle physics, track, scenery, chase camera, effects, race loop.
- `src/ui/` holds the menus, garage, HUD and touch controls.
- The race code (three.js, physics, models) loads only when you start a race, so the menu appears quickly on mobile data.

## Reference

- `reference/vehicle-showroom.html`: the original approved vehicle concepts.
- `reference/vehicle-showroom-sporty.html`: the sporty race-build versions used in the game (built from `reference/sporty/` with `node reference/sporty/build.mjs`).
