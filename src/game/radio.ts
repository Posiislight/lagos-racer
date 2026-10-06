import { STATIONS, RADIO_VOLUME, type Station } from '../config/radio';
import { setAmbienceUnderRadio } from './audio';

/**
 * Live radio through a plain <audio> element: it plays cross-origin streams without CORS headers,
 * which a Web Audio source would need. A stream that fails (offline, blocked) just stays silent and
 * the street ambience returns to full.
 */
let el: HTMLAudioElement | null = null;
let muted = false;
let wanted = false;

const station = (): Station => STATIONS[0];

export type RadioStatus = 'off' | 'loading' | 'playing' | 'failed';
let status: RadioStatus = 'off';
const listeners = new Set<() => void>();
const setStatus = (s: RadioStatus) => {
  if (s === status) return;
  status = s;
  setAmbienceUnderRadio(s === 'playing' || s === 'loading');
  listeners.forEach(l => l());
};
export const radioStatus = () => status;
export function onRadioStatus(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
export const radioName = () => station().name;

/** Start the station. Call from a user gesture or soon after one (browsers refuse autoplay otherwise). */
export function startRadio() {
  wanted = true;
  if (el) return;
  el = new Audio();
  el.preload = 'none';
  el.volume = RADIO_VOLUME;
  el.muted = muted;
  el.addEventListener('playing', () => setStatus('playing'));
  el.addEventListener('waiting', () => wanted && setStatus('loading'));
  el.addEventListener('error', () => setStatus('failed'));
  el.addEventListener('stalled', () => wanted && setStatus('loading'));
  el.src = station().url;
  setStatus('loading');
  el.play().catch(() => setStatus('failed'));
}

/** Stop and release the stream, so it stops using mobile data. */
export function stopRadio() {
  wanted = false;
  if (el) { el.pause(); el.removeAttribute('src'); el.load(); el = null; }
  setStatus('off');
}

/** Pause the stream while the tab is hidden; resume it on return if it is still wanted. */
export function setRadioHidden(hidden: boolean) {
  if (!el) return;
  if (hidden) el.pause();
  else if (wanted) el.play().catch(() => setStatus('failed'));
}

/** Follows the Sound setting. */
export function setRadioMuted(m: boolean) {
  muted = m;
  if (el) el.muted = m;
}
