/**
 * A touch device held upright gets the app turned 90° in CSS, so the game plays sideways even where
 * the browser can't lock the screen to landscape (in-app browsers, rotation lock on).
 */
export function shouldFakeLandscape(coarse: boolean, portrait: boolean): boolean {
  return coarse && portrait;
}

export type Box = { left: number; top: number; right: number; bottom: number };

/**
 * A screen point as the rotated app sees it. `box` is the on-screen bounding box of an element inside
 * the app (getBoundingClientRect). Turned 90° clockwise, the app's x runs down the screen and its y
 * runs from the screen's right edge to its left. Unrotated, it's the plain offset into the box.
 */
export function toLocalPoint(clientX: number, clientY: number, box: Box, rotated: boolean): { x: number; y: number } {
  return rotated ? { x: clientY - box.top, y: box.right - clientX } : { x: clientX - box.left, y: clientY - box.top };
}

/** Width and height of an element as the rotated app sees it (the on-screen box has them swapped). */
export function localSize(box: Box, rotated: boolean): { width: number; height: number } {
  const w = box.right - box.left, h = box.bottom - box.top;
  return rotated ? { width: h, height: w } : { width: w, height: h };
}

/** Is the app currently turned? Read where an event handler needs to undo it. */
export function appRotated(): boolean {
  return typeof document !== 'undefined' && document.querySelector('.app')?.hasAttribute('data-rotated') === true;
}
