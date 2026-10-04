# Third Mainland Bridge track

## Goal

Ojuelegba and the planned Ikorodu track are all street scenery, so they look alike. This track is a different
place: a long journey over open water, in the spirit of Beach Buggy Racing's differently-shaped, differently-themed
maps. Reference photo from the user: a raised concrete deck sweeping in a long curve over the lagoon, a jam of
yellow danfos on the other carriageway, the mainland a hazy strip in the distance.

Decisions (with the user, 4 October): a new track beside Ojuelegba (Ikorodu is left as it is); hand-drawn route,
loosely following the real bridge; **2 laps**; a longer lap with real bends, not an oval; and the track must be
able to take **shortcuts** later.

## The route

About 2.6 km a lap (Ojuelegba is about 0.75 km). Control points are in `src/config/thirdMainland.ts`, x east, z
south, start line at the origin heading east. Tightest bend 24 m radius (a BRT needs 12), steepest grade 7%.

| Stage | s (m) | What |
|---|---|---|
| Mainland street | 0 to 300 | Start straight with the market and a danfo park, a kink |
| Ramp | 300 to 640 | A long right-hand curl that climbs 14 m |
| Main span | 640 to 1420 | Over the lagoon, with an S and a long sweep, the other carriageway beside it |
| Island end | 1420 to 1760 | The deck swings round and drops down a curving ramp |
| Causeway | 1760 to 2290 | A low road through the stilt-house water village, with a chicane |
| Home | 2290 to 2625 | The mainland street, a hairpin-ish turn and back to the line |

The height of the road is a profile along the lap (`heights`, `profileHeight` in `src/game/track.ts`): knots of
[metres, height] with cosine easing, so ramps and decks are flat-topped and smooth. It replaces the sine hills the
street tracks use.

## A different terrain: `setting`

`TrackConfig.setting` (`Setting` in `src/config/tracks.ts`) holds the sky gradient, haze colour, light colours, the
painted horizon (`city` skyline or `shore`), and optional `water`. `STREET` is the default, so Ojuelegba is
unchanged. `RaceScene` reads it for the sky, fog, hemisphere light, sun and backdrop.

`water` makes a lagoon: a glossy plane at a given level whose ripples drift (a scrolling tile texture, off on low
quality), and land only where the track says so: round `discs` and `banks` along stretches of the lap. Everywhere
else is water. Cost: one plane, one terrain grid, instanced-by-merge props.

On this track (`src/scene/lagoon.ts`): concrete deck with parapets and an underside; piers down to the floor or the
ground; lamps; overhead signs; the other carriageway (a second deck with 3 lanes of stationary danfos and cars,
only where it fits); canoes with paddlers, buoys and fishing boats; stilt houses with zinc roofs beside the
causeway, which has a rocky bank sloping into the water. The street scenery builder skips poles and lamps on raised
road and has no ring of buildings over water.

## Shortcuts

A track lists them as data:

```ts
shortcuts: [{ id: 'across-the-bay', from: 700, to: 1200, path: [[380, 520], [330, 600]] }]
```

`from` and `to` are lap distances on the main road. `buildBranch` samples the path as an open road, tangent to the
main road at both ends, eased between their heights. `checkShortcut` rejects one that is not shorter, runs into
the road, or bends tighter than 12 m.

**Lap counting.** Progress stays on the main road. `projectRoad` (used by `race.ts` and so by the server referee)
puts a car on a branch at its main-road equivalent: the fraction of the branch driven, spread over the stretch it
replaces. So progress is continuous at the fork and the rejoin (no jump to be ignored), positions are right, and
the shorter branch really is quicker. A branch lies inside one lap, so the start line can't be skipped.

**Not built yet** (needed when the first shortcut is added): drawing the branch road and its colliders and walls
(the main walls need a gap at the fork and the rejoin, `wallBoxes` takes a mask like the other builders), a way to
see the fork (arrow sign), and AI that picks a branch.

The room server's referee checks speed and lap times against the main-road distance. A branch makes a car's
main-road distance grow a little faster than it drives, but the referee allows 1.6 times top speed, so a shortcut
that skips up to about a third of a lap needs no change. A bigger one would need those limits scaled.

## Testing

`src/config/tracks.test.ts`: every track has a sane lap, pickups and bends; this track's length, winding, flat
start, grades, spacing, scenery only on low road, land and water in the right places. `src/game/shortcuts.test.ts`:
the profile, building and checking a branch, projection, lap counting through a shortcut. Autopilot play-tests on
the phone-size viewport at each quality (see the summary in the pull request).
