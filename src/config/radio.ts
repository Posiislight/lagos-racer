/**
 * In-race radio stations, streamed live (Icecast/Shoutcast over HTTPS). The names are real station
 * names chosen by the user (6 October), like the Ikorodu signs: lettering only, no logo artwork.
 * Add a station by adding a row; the HUD button turns the radio on and off.
 */
export type Station = { id: string; name: string; url: string };

export const STATIONS: Station[] = [
  { id: 'cool969', name: 'Cool FM 96.9', url: 'https://coolfmlagos969-atunwadigital.streamguys1.com/coolfmlagos969' },
];

/** Radio loudness, 0..1 of the phone's media volume. */
export const RADIO_VOLUME = 0.7;
/** The street ambience level while the radio is playing (otherwise 0.35). */
export const AMBIENCE_UNDER_RADIO = 0.12;
