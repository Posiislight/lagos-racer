/** Driving controls shared by the player (keyboard + touch) and the AI. All values 0..1 or -1..1. */
export type Controls = {
  throttle: number;
  brake: number;
  /** -1 full left .. 1 full right. */
  steer: number;
  handbrake: boolean;
  horn: boolean;
  /** Set for one frame when the item button is pressed. */
  useItem: boolean;
};

export const emptyControls = (): Controls => ({ throttle: 0, brake: 0, steer: 0, handbrake: false, horn: false, useItem: false });

/** Raw touch state written by the on-screen buttons. */
export const touch = { left: false, right: false, gas: false, brake: false, drift: false, horn: false, item: false };

const keys = new Set<string>();
let itemQueued = false;
let listening = false;

export function startKeyboard() {
  if (listening) return;
  listening = true;
  window.addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    if (!e.repeat && (e.code === 'KeyE' || e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyF')) itemQueued = true;
    keys.add(e.code);
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
}

export function queueItem() { itemQueued = true; }

let steerSmooth = 0;

// ---- Tilt steering (phones): turn the phone like a steering wheel ----
let tiltSteer = 0, tiltOn = false;
function onOrientation(e: DeviceOrientationEvent) {
  const angle = screen.orientation?.angle ?? 0;
  // Held sideways the wheel axis is the phone's beta; upright it's gamma. Right edge down = right.
  const a = angle === 90 ? (e.beta ?? 0) : angle === 270 ? -(e.beta ?? 0) : (e.gamma ?? 0);
  const v = Math.max(-1, Math.min(1, a / 22));
  tiltSteer = Math.abs(v) < 0.06 ? 0 : v;
}
/** Start listening to the phone's tilt. Call from a tap: iPhones ask for permission first. */
export async function enableTilt(): Promise<boolean> {
  const D = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
  try { if (D.requestPermission && (await D.requestPermission()) !== 'granted') return false; } catch { return false; }
  if (!tiltOn) { window.addEventListener('deviceorientation', onOrientation); tiltOn = true; }
  return true;
}

/**
 * Read the player's controls. You're always on the gas, so steering is all you need: keys or
 * buttons (eased in, so a tap is a small correction) or tilting the phone.
 */
export function readPlayer(out: Controls, dt: number, opts: { tilt: boolean; invertTilt: boolean }) {
  const k = (...codes: string[]) => codes.some(c => keys.has(c));
  const left = k('ArrowLeft', 'KeyA') || touch.left;
  const right = k('ArrowRight', 'KeyD') || touch.right;
  const target = (right ? 1 : 0) - (left ? 1 : 0);
  const rate = target === 0 ? 7 : Math.sign(target) !== Math.sign(steerSmooth) ? 9 : 4.5;
  steerSmooth += Math.max(-rate * dt, Math.min(rate * dt, target - steerSmooth));
  out.steer = opts.tilt && tiltOn && target === 0 ? tiltSteer * (opts.invertTilt ? -1 : 1) : steerSmooth;
  // Down/S still brakes and reverses on a keyboard, for anyone who wants it.
  const braking = k('ArrowDown', 'KeyS') || touch.brake;
  out.throttle = braking ? 0 : 1;
  out.brake = braking ? 1 : 0;
  out.handbrake = k('Space') || touch.drift;
  out.horn = k('KeyH') || touch.horn;
  out.useItem = itemQueued || touch.item;
  itemQueued = false;
  touch.item = false;
}

export function resetPlayerInput() { steerSmooth = 0; keys.clear(); Object.keys(touch).forEach(k => ((touch as Record<string, boolean>)[k] = false)); }
