# Overnight progress (2026-10-03)

> **Update (3 October, afternoon):** the track is now the real Ojuelegba Road (out and back, from OpenStreetMap), there are four vehicles with paint colours, bumps push vehicles apart, Space uses power-ups, and boosts show speed lines. Design: [docs/superpowers/specs/2026-10-03-ojuelegba-road-track-design.md](superpowers/specs/2026-10-03-ojuelegba-road-track-design.md). Parts of this page below describe the old made-up loop and the six-vehicle line-up.

You asked me to finish the sporty vehicles, then build the map and the game while you slept.
The brief says to confirm each milestone plan first; you weren't available, so I wrote the plan
down and went ahead. Below is what exists now, what changed from your feedback during the
night, and what I'd do next.

## How to try it

```bash
npm install
npm run dev
```

Open http://localhost:5173 (or the Network address on your phone). Handy flags:
`?unlock=all` opens the locked BRTs, `?autopilot=1` lets the AI drive your vehicle.

## Done

**Sporty vehicles.** Four agents restyled the okada, keke, danfo and BRT as "factory race builds"
that keep every Lagos detail from the brief. Compare `reference/vehicle-showroom.html` with
`reference/vehicle-showroom-sporty.html`. The game imports the same models
(`node scripts/sync-models.mjs`), with lighter geometry and merged materials for phones.

**Milestone 1, playable race.** Ojuelegba loop, Rapier raycast vehicle physics with arcade assists,
chase camera, keyboard and touch controls (optional auto-gas), countdown ("OYA GO!"), 3 laps,
lap timer and best lap, HUD with minimap, results screen, pause menu, quality setting.

**Milestone 2, AI.** Three AI rivals with lane changes, braking for bends, overtaking, unsticking,
light rubber-banding. Live race positions.

**Milestone 3, power-ups.** Pickups on the road; juju bomb (thrown, explodes, spins cars out) and
crude oil slick (dropped behind). Toughness decides how long you spin. AI uses items too.

**Comedy layer (start).** Goats and chickens wander across the road (Lagos's answer to Beach
Buggy's critters); hit one and it flies off and vanishes, costing some speed. Synthesised sounds
(no downloads): engine, horns per vehicle ("PON PON"), countdown, items, goat bleat, chicken.

**Garage-lite.** Vehicle select with stats and a 3D turntable; coins per race; BRTs unlock with coins.
After the second race, a prompt suggests creating an account (button is a placeholder).

**PWA.** Manifest, icons and offline caching via `vite-plugin-pwa`. `npm run build` outputs `dist/`.

## Changes from your feedback during the night

- **Street View reference (25 Ojuelegba Rd).** Hand-painted building fronts based on it: weathered
  three-storey concrete with louvre windows, burglar bars and AC units; older houses with balconies
  and rusty zinc roofs; open shopfronts with clothes hanging; overhead wires on concrete poles;
  traders, umbrellas and parked cars. Real shop names are replaced with made-up ones.
- **"Not blocks of buildings".** Detail lives in painted textures on simple shapes, plus flat
  cut-out crowds, a painted Lagos skyline, clouds and ground variation, the way Beach Buggy does it.
- **No barriers; buildings close and tight.** The red-and-white barriers and painted kerbs are gone.
  A plain concrete kerb, a narrow pavement with the gutter, then shop fronts wall to wall. The kerb
  line is the edge of the track.
- **Smaller map.** The loop went from 910 m to 656 m and the road from 16 m to 13 m wide.
- **Ups and downs.** Gentle rolling hills along the lap (max grade about 5%).

## Performance (measured in headless Chrome)

- High quality, 1280×720: about 150–425 draw calls, 120–270k triangles, ~55–60 FPS.
- Low quality at phone size (844×390): about 100–150 draw calls, 110–190k triangles.
- Download (gzipped): menu ~75 KB, 3D engine ~246 KB, models ~21 KB, physics ~851 KB (race only).

These are desktop numbers. It still needs a test on a real budget Android phone.

## Changes from your feedback (morning, 3 October)

- **Always accelerating.** You only steer: ◀ and ▶ on either side of the screen, or tilt the phone
  (Settings, with a "reverse tilt" toggle). Walls cost speed on impact (more head-on) and while you
  scrape along them; bumping another vehicle costs the lighter one more. Stuck nose-first, you back
  out automatically. The walls are now solid boxes, so nothing can punch through at full speed.
- **Items are icons, not mystery boxes.** Fuel (speed boost, flame out the back), crude oil (dropped
  behind; whoever hits it goes slippery and slides), juju (homes in on the racer ahead and slows
  them, purple aura). Every row on the road mixes all three, so you can choose.
- **Goats and chickens**: no text; a little speed lost and a shaky ride for a moment. The hit sound
  is `sfx('goat')` / `sfx('chicken')` in `src/game/audio.ts` if you want to swap in a recording.
- **Six racers**, two lanes, three deep, you start at the back: Blue Okada, Red Okada, Keke, Danfo,
  Blue BRT, Red BRT (you pick one; the AI drives the rest).
- **Bumpier road**: bigger rolling hills plus shorter humps and a ripple you feel in the suspension
  (about 4 m between the lowest and highest point of the lap).

## Known issues and next steps

- The AI BRT sometimes wedges itself on the tightest corner and gets put back on the road after a
  couple of seconds.
- Tilt steering hasn't been tried on a real phone yet; if left and right feel swapped, use the
  "reverse tilt" toggle in Settings.
- Only one track. Third Mainland Bridge or Balogun market would be next; tracks are data
  (`src/config/tracks.ts`) plus scenery zones.
- Comedy layer still to do: conductors visibly throwing the power-ups, LASTMA ambush, potholes and
  open gutters as hazards, more horns and voice lines.
- Accounts, leaderboard and server-side score validation are not started (milestone 5).
- Nothing is committed to git yet. The project folder sits inside the git repo that covers your home
  folder, so you'll probably want `git init` in `lagos-racer` first.
