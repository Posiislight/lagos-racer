import { useEffect, useState } from 'react';
import { shouldFakeLandscape } from './rotate';

const COARSE = '(pointer: coarse)';
const PORTRAIT = '(orientation: portrait)';

function read(): boolean {
  return shouldFakeLandscape(matchMedia(COARSE).matches, matchMedia(PORTRAIT).matches);
}

/**
 * True while a touch device is held upright. The app then turns itself 90° (`.app[data-rotated]`)
 * so the game plays sideways without the player doing anything, even in in-app browsers that ignore
 * the orientation lock. Turn the phone for real and this goes false and the app lies flat again.
 */
export function useFakeLandscape(): boolean {
  const [rotated, setRotated] = useState(read);
  useEffect(() => {
    const queries = [matchMedia(COARSE), matchMedia(PORTRAIT)];
    const update = () => setRotated(read());
    queries.forEach(q => (q.addEventListener ? q.addEventListener('change', update) : q.addListener(update)));
    update();
    return () => queries.forEach(q => (q.removeEventListener ? q.removeEventListener('change', update) : q.removeListener(update)));
  }, []);
  return rotated;
}
