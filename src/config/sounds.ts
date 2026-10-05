/**
 * Every game sound by name. `file` is optional: if it is missing or fails to load, the synthesised
 * version in `src/game/audio.ts` plays instead. Drop recordings in `public/audio/` (see its README).
 */
export type SoundName =
  | 'ambience' | 'jujuFly' | 'jujuHit' | 'oilDrop' | 'oilSlip' | 'fuelBoost'
  | 'odeshi' | 'odeshiBreak' | 'pushSquad' | 'soup' | 'soupBubble';

export type SoundDef = { file: string; volume: number; loop?: boolean };

export const SOUNDS: Record<SoundName, SoundDef> = {
  ambience: { file: '/audio/ambience-lagos.ogg', volume: 1, loop: true },
  jujuFly: { file: '/audio/juju-fly.ogg', volume: 0.8, loop: true },
  jujuHit: { file: '/audio/juju-hit.ogg', volume: 1 },
  oilDrop: { file: '/audio/oil-drop.ogg', volume: 0.9 },
  oilSlip: { file: '/audio/oil-slip.ogg', volume: 0.9 },
  fuelBoost: { file: '/audio/fuel-boost.ogg', volume: 0.9 },
  odeshi: { file: '/audio/odeshi.ogg', volume: 0.9 },
  odeshiBreak: { file: '/audio/odeshi-break.ogg', volume: 0.9 },
  pushSquad: { file: '/audio/push-squad.ogg', volume: 1 },
  soup: { file: '/audio/soup.ogg', volume: 0.9 },
  soupBubble: { file: '/audio/soup-bubble.ogg', volume: 0.5, loop: true },
};
