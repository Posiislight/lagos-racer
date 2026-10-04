# Ikorodu Garage track

## Goal

A second track on the real road between General Hospital Ikorodu and the garage roundabout (the junction of
Ikorodu Road, Sagamu Road and Ayangburen Road, next to the Oriwu Central Mosque). Race north from the hospital
along Beach Road and Ayangburen Road, turn round the roundabout, race back south, and U-turn at the hospital to
finish the lap. It uses real signage: real business and place names, but only ones read off a sign.

It builds on the Ojuelegba Road work (`2026-10-03-ojuelegba-road-track-design.md`): the two-leg track code
(median ranges, hills along the axis, U-turns, `track-report`) and `scripts/osm-track.mjs`. This spec does not
start until that work has landed, or is built on top of its branch. It is single-player only and keeps the
multiplayer interfaces intact (it is just another entry in `TRACKS`). A plot of the route is in
`2026-10-04-ikorodu-route.svg`.

### Decisions made (with the user, 4 October)

- **Route:** General Hospital Ikorodu to the garage roundabout and back (replaces the earlier out-and-back on
  Ikorodu Road west of the junction).
- **Scale 0.3, 3 laps.**
- **Real names on signs.** This track deliberately breaks the "no real brand logos" rule in `CLAUDE.md`. Real
  business and place names appear on signs, drawn as lettering in each brand's colours. No logo image files are
  downloaded or shipped.
- **Only names seen on a sign.** A real name goes on a sign only if it was read off that sign in Street View (or
  in the user's own photos or video). Names that come only from OpenStreetMap, and anything unreadable, are left
  as generic unlabelled shopfronts. Nothing is invented.
- **Layout from OpenStreetMap**, as for Ojuelegba (ODbL, credit "© OpenStreetMap contributors"). Street View was
  only looked at, by eye, to see the street and read signs.

### Assumptions

- Start/finish line: on the northbound leg just north of the hospital gate, facing north.
- Real brand names are a trademark risk for a deployed game with coins. The decision is the user's and is
  recorded here and in `CLAUDE.md`. Signs are data (see "Signs"), so switching this track to invented names is a
  change to one data file and one flag.
- The real road is one two-way road for about 1 km. The game splits it into two legs with a divider, as in the
  Ojuelegba spec (see "Layout").

### Out of scope

- The BRT terminal and Ikorodu Road west of the junction as drivable road (they appear only as backdrop at the
  roundabout end), Sagamu Road, back streets.
- Buying paint, stickers or horns; any multiplayer code.
- Real celebrity names or likenesses. Posters on hoardings show anonymous cut-out people, never real faces.

## The track

### Where the data comes from

`scripts/osm-track.mjs` (from the Ojuelegba work) gets a track argument. For this track it takes the road from
the hospital access (service road 459427794) along Beach Road (538323260) and Ayangburen Road (1460813931, then
the one-way pair 778859468 northbound and 1460813930 southbound) to the roundabout (134580953). Local origin is
the start line, x east, z south, scaled 0.3. Output goes into `src/config/tracks.ts` as `control` points,
checked in. The game never fetches map data at runtime.

Route as found by routing over OSM (real metres, origin at the junction pin, z south), simplified to 3 m:

- Out: (-474,1307) (-503,1289) (-385,1094) (-265,881) (-207,754) (-126,519) (-95,407) (-60,307) (-34,219) (-3,62) (10,32)
- Back: (-21,31) (-13,48) (-12,77) (-40,218) (-95,398) (-126,519) (-207,754) (-265,881) (-385,1094) (-503,1289) (-474,1307)

| Section | Real length | At 0.3 |
|---|---|---|
| Hospital service road | 34 m | 10 m |
| Beach Road, single two-way road | 489 m | 147 m |
| Ayangburen Road, single two-way road | about 490 m | 147 m |
| Ayangburen Road, dual carriageway, to the roundabout | about 390 m | 117 m |
| One leg | 1,401 m | 420 m |

Two legs plus two U-turns make a lap of about 900 m, a fifth longer than the Ojuelegba lap. Three laps is about
2.7 km.

### Layout

- **Two legs, 13 m wide roads** (half width 6.5 m) with a 1.6 m median, as in the Ojuelegba spec. For about
  1 km the real road is a single carriageway with no median, so the game adds one: a black-and-white painted
  kerb strip (the same painted kerb seen along stretches of Beach Road). On the dual carriageway section the
  median is a long low concrete barrier wall, as seen in Street View. Racers see each other across the kerb strip
  and over the barrier.
- **Roundabout U-turn.** The real ring has a radius of about 18 m, which is 5 m at 0.3 scale, far below the
  12 m centreline radius the BRT needs (checked by `track-report`). The in-game roundabout island is
  therefore enlarged to give the 12 m radius, a deliberate exaggeration. The statue on the island is kept.
- **Hospital U-turn.** OSM shows only a 34 m service road at the hospital end. The U-turn there is built to
  the same 12 m minimum radius. If the OSM geometry cannot give that, it is a constructed turning circle in
  the hospital forecourt, and the track report flags it as invented geometry.
- **Heights:** gentle rolling hills along the road axis (distance along the route), so both legs are at the same
  height wherever they are side by side, as for Ojuelegba.

## Scenery and signs

### Seen in Street View

Stops are listed from the roundabout end down to the hospital. Street View's own labels call Beach Road "Oba
Sekumade Road"; OSM says Beach Road. The game shows neither name.

| Where | What I saw | Used as |
|---|---|---|
| Ayangburen Road dual carriageway, about 200 m south of the roundabout, facing south | Long low concrete barrier wall down the middle; rows of yellow keke along it; old 2 to 3 storey shops with balconies, red corrugated awnings and unreadable signboards on the east side; water-sachet hawkers; a green building with signs on the west side | Concrete-barrier median, keke rows, east-side shop frontage, hawkers |
| Ayangburen Road, about 390 m south of the roundabout (end of the dual carriageway) | Yellow 3-storey building with an orange roof and a blue church sign on the west side; pink perimeter wall with railing fence; okada and keke traffic; parked cars | West-side yellow building, perimeter wall |
| Ayangburen Road, about 520 m south of the roundabout | A KFC sign on a building on the east side; a blue tailoring board; a pack of okadas; a pink perimeter wall on the west side; trees | KFC frontage, tailoring board, okada pack |
| Ayangburen Road, about 770 m south of the roundabout | Parked tanker truck (white tank, yellow cab), sedans, a stall of colourful plastic goods under a zinc fence, rebar columns of an unfinished building, flat-roofed shops | Tanker truck prop, goods stall, unfinished building |
| Beach Road, first stretch | Wide quiet road, solar street lights, black-and-white painted kerb on the left, big trees, blue-painted kiosks and shacks on the right, a telecom mast | Beach Road look, blue kiosks, solar lights |
| Beach Road, middle | Shops with signs on the right (a red "chicken…" sign with a rooster icon, partly read), a white minibus, a red sedan, a green billboard, bushes | Roadside shops, minibus prop |
| Hospital | Pink and yellow single-storey blocks with barred windows, a covered walkway on dark posts, a red "REVENUE / PAY POINT" sign, a notice board with the Lagos State crest, people sitting on benches | Hospital buildings, pay-point sign |

At the roundabout end:

| Where | What I saw | Used as |
|---|---|---|
| Junction, facing ENE | Oriwu Central Mosque: four minarets, gold dome, lettered across the front; a row of yellow danfos and market umbrellas in front | Mosque facade cell with a lettered sign, danfo row |
| Junction, facing SSW | Green-canopy fuel station with an "ap" logo; hawkers under umbrellas; traffic light on a pillar | Petrol station canopy (green) |
| Junction, facing SSE | Roundabout island with a statue on a plinth, blue direction arrow, hoarding covered in AutoCAD flyers, a poster naming KD Lounge, solar street light | Statue island, flyer hoarding |
| Junction, facing WSW | Market umbrellas (orange and purple), flatbed truck, blue-roofed multi-storey block | Market stalls, truck prop |
| Ikorodu Road, 150 m west of the junction | Red building with TCL signage; white and light-blue Ashok Leyland BRT bus | Backdrop at the roundabout end |
| Ikorodu BRT terminal | Blue arched canopy, blue BRT buses (one numbered 319), banners on lamp posts, a sign starting "IKOR…" | Backdrop at the roundabout end |

Throughout: overhead wires on concrete poles, hawkers between vehicles, yellow danfos, crowds of cut-out people.

### Not yet seen

The far end of Beach Road (between the middle stretch and the hospital gate) and the east and west sides of
Beach Road have not been looked at. Their scenery is generic shopfronts, stalls, walls and trees until someone
supplies photos or video (see "Survey still to do"). Shopfront signs on Ayangburen Road and Beach Road that were
too small to read are also left generic.

### Signs (data)

Signs live in `src/config/signs/ikorodu.ts` as `{ id, text, colors, where, source }`, drawn by the existing canvas
texture system in `src/scene/art/textures.ts`. `TrackConfig` gets `signage: 'real' | 'generic'`; `generic`
replaces every text with an unlabelled equivalent.

| Text | Where | Colours | Source | Status |
|---|---|---|---|---|
| ORIWU CENTRAL MOSQUE, IKORODU | Mosque front | Cream, dark lettering | Street View, read on the sign | Verified |
| ap | Petrol station canopy | Green, white | Street View, read on the canopy | Verified |
| AutoCAD | Flyer hoarding | Mixed posters | Street View, read on the flyers | Verified |
| TCL | Red building (backdrop) | Red, white | Street View, read on the sign | Verified |
| IKOR… | Terminal sign (backdrop) | Blue | Street View, partial | Full text unconfirmed. Not used until read. |
| KD Lounge | Poster near the roundabout | | Street View, partial | Unconfirmed. Not used until read. |
| KFC | Building on the east side of Ayangburen Road, about 520 m south of the roundabout | Red, white | Street View, read on the sign | Verified. Lettering only, no logo artwork. |
| REVENUE / PAY POINT | Hospital walkway | Red, white | Street View, read on the sign | Verified |
| TAILORING, WEDDING SUITS, FASHION | Blue board on the east side of Ayangburen Road | Blue, white | Street View, words read; the first letters of some lines are cut off | Verified words only. Not used with "EXCLUSIVE" or "ETHNIC" (inferred). |
| ZENITH … JAMB | Small board on the east side of Ayangburen Road | White, black | Street View, partial | The line between the words is unreadable. Not used until read. |
| THE BUILDER … MAKER … CHURCH | Blue sign on the yellow building, west side | Blue, white | Street View, partial | Not used until read. |
| chicken… | Red sign on Beach Road with a rooster icon | Red, white | Street View, partial | Not used until read. |
| General Hospital Ikorodu | Hospital gate | | Street View's place label only | Not seen on a sign. Not used until read. |

Names from OSM that I have not seen on a sign (Access Bank, Skye Bank, Accion, Primero, Forte Oil, Shine Shine
Plaza, Trade Center) are **not used**. Some are out of date (Forte Oil is now Ardova; Skye Bank became Polaris).

### New props

Mosque facade (four minarets, gold dome), petrol station canopy (reuse the Ojuelegba one, in green), flyer
hoarding, statue roundabout island, terminal canopy (blue arch, backdrop), BRT bus in white and light blue,
solar street light, banner lamp posts, flatbed truck, tanker truck, market umbrellas, concrete barrier wall,
black-and-white painted kerb strip, hospital buildings with covered walkway, yellow 3-storey building with orange
roof, blue kiosks. Lamp posts and the median strip come from the Ojuelegba work.

## Survey still to do

The embedded Street View is slow (about 30 s per panorama) and low resolution, so small shopfront lettering is
often unreadable. Four stops on Ayangburen Road, two on Beach Road and one at the hospital have been looked at
(listed above). Still open: the far end of Beach Road, the west side of Beach Road, and any shops whose lettering
was too small. Before building scenery for those stretches, the user can send photos or video of the route (a
slow drive or walk down each direction, plus stills of each side at the hospital, mid-route and the roundabout),
or we accept generic shopfronts there. Frames pulled from video can be read for signs.

## Testing

Same as Ojuelegba: unit tests for projection onto each leg and lap counting on the new track; `track-report`
(lap about 900 m, smallest radius at least 12 m at both U-turns, no sections too close outside the median);
autopilot play-tests with every vehicle on phone size at low and high quality (every vehicle finishes 3 laps
without respawns at either U-turn); side-by-side screenshots against the Street View stops; `npm run build`
passes. One extra test checks that `signage: 'generic'` produces no text from `signs/ikorodu.ts`.

## Build order

1. Track data (hospital to roundabout); track config entry; unit tests and `track-report`.
2. Scenery: concrete barrier and painted-kerb median, roundabout island with statue, mosque, petrol station,
   flyer hoarding, Ayangburen Road shop frontage, hospital, generic roadside elsewhere.
3. Signs data, textures, the `signage` flag.
4. Track picker in the menu; save migration for best laps per track.
5. Play-tests, screenshots, README and `CLAUDE.md` updates (tracks list, the real-name exception, OSM credit).
