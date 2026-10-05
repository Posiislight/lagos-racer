# Audio: Lagos ambience, hazard warnings, power-up sounds

Date: 5 October 2026. Status: awaiting review.

## Goal

The game has no background sound beyond the engine, and power-up sounds are short synth blips that don't tell players what is happening around them. Make the race sound like Lagos and make hazards audible before they hit.

## Decisions (from the user)

- No musical soundtrack. Background is a looping Lagos street bed: traffic pings, angry shouting, generator hum. The user records or edits it in Audacity and supplies the file.
- Hybrid sourcing: sounds load from files in `public/audio/` when present; otherwise the existing synthesised sound plays. Nothing breaks when a file is missing.
- "The foil" is read as the **fuel** boost item (the code has juju, oil, odeshi, fuel; there is no projectile item).
- Out of scope: music tracks, per-track ambience beds, the water-sachet projectile.

## Design

### 1. Engine

- Split `src/game/audio.ts`: keep the synth primitives (`tone`, `noise`, `Engine`, `playHorn`, `beep`); add a sample loader and mixer.
- `src/config/sounds.ts`: manifest mapping sound name (e.g. `juju.fly`, `oil.drop`, `ambience.lagos`) to `{ file?, volume, loop? }`.
- `sfx(name)` plays the loaded file if available, else the synth fallback. A failed or pending load falls back silently.
- Files load lazily after the first user gesture, ambience first. Mono ogg/mp3, whole set under about 1 MB.
- Gain buses: ambience, sfx, engine, into the master (existing mute still applies). Ambience sits low under the engine.

### 2. Ambience

- Starts with the race countdown, stops on finish or exit.
- Fallback until a file exists: quiet synth bed (filtered noise murmur plus occasional distant horn pings).
- Ducks slightly while a special or hit sound plays.

### 3. Hazard warnings

- A juju in flight that is targeting the local player loops a hum. Volume and pitch rise as distance falls; stereo pan follows its bearing. It stops when the juju lands or fizzles.
- Impact sound when the juju lands; odeshi fizzle sound when it is blocked.
- Crude oil: a drop sound on placement, a skid sound on slip (also audible when an opponent slips nearby).

### 4. Item and special sounds

| Item | Sounds |
|---|---|
| Fuel | rising rev and whoosh; engine pitch lift while boosting |
| Odeshi | activation chime; shield-break sound when it expires |
| Push Squad | crowd shout and rhythmic stomps |
| Pepper Soup Trail | sizzle on activation, bubbling while live, cough on hit |

### 5. Files the user may supply

`ambience-lagos`, `juju-fly`, `juju-hit`, `oil-drop`, `oil-slip`, `fuel-boost`, `odeshi`, `push-squad`, `soup` (ogg or mp3) in `public/audio/`. Names are documented in `public/audio/README.md`.

## Testing

- Unit tests: fallback when a file is missing, fails to load, or sound is muted; juju distance-to-volume/pitch mapping.
- Browser check at a mobile viewport for load errors and that the loop starts and stops. Sound quality has to be judged by ear by the user.

## Risks

- Mobile browsers need a user gesture to start audio; the existing `unlockAudio` handles that. Loading must not block the race start.
- Large files would hurt mobile data users; the 1 MB budget applies.
