import type { ItemKind } from './runtime';
import type { Quality } from './save';

/**
 * Screen effects for the player, written every frame by the 3D scene (FxBridge) and read by the
 * screen overlay (ScreenFx) and the chase camera. A plain object, so neither side re-renders React.
 */
export const fx = {
  /** 0..1: how strongly the fuel boost shows (speed lines, wider view, shake). Eased in and out. */
  boost: 0,
  /** Seconds since the player was last hit by juju (Infinity: not recently). */
  juju: Infinity,
  /** 0..1: oily screen edges while the player is slipping on crude oil. */
  slip: 0,
  /** 0..1: the blurred, watering-eyes screen while the player is coughing from pepper soup. */
  cough: 0,
  /** Power-ups just picked up, at their screen position (CSS pixels), waiting to fly into the item button. */
  pickups: [] as { kind: ItemKind; x: number; y: number }[],
  quality: 'high' as Quality,
};

export function resetFx() {
  fx.boost = 0; fx.juju = Infinity; fx.slip = 0; fx.cough = 0; fx.pickups.length = 0;
}
