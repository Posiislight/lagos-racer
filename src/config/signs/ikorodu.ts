import type { TrackConfig } from '../tracks';

/**
 * Real signs on the Ikorodu Garage route. Only text that was read on a sign (Street View, 4 October) is
 * here. Lettering in brand colours only: no logo artwork. Switch the track's `signage` to 'generic' to
 * draw none of them.
 *
 * Seen only in part, so NOT used until read in full: "IKOR…" (terminal), "KD Lounge", "ZENITH … JAMB",
 * "THE BUILDER … MAKER … CHURCH", "chicken…", and "General Hospital Ikorodu" (a Street View place label,
 * not a sign). From OpenStreetMap only and never seen on a sign, so NOT used: Access Bank, Skye Bank
 * (now Polaris), Accion, Primero, Forte Oil (now Ardova), Shine Shine Plaza, Trade Center.
 */
export type Sign = {
  id: string;
  /** One entry per line of lettering. */
  text: string[];
  colors: { bg: string; fg: string };
  where: string;
  source: string;
};

const SV = 'Street View, read on the sign';

export const IKORODU_SIGNS: Sign[] = [
  { id: 'mosque', text: ['ORIWU CENTRAL MOSQUE, IKORODU'], colors: { bg: '#efe6cf', fg: '#2b2a26' }, where: 'Mosque front at the roundabout', source: SV },
  { id: 'ap', text: ['ap'], colors: { bg: '#1e8a46', fg: '#ffffff' }, where: 'Fuel station canopy at the roundabout', source: SV },
  { id: 'autocad', text: ['AutoCAD'], colors: { bg: '#f2f2f2', fg: '#c62828' }, where: 'Flyer hoarding on the roundabout approach', source: SV },
  { id: 'tcl', text: ['TCL'], colors: { bg: '#c62828', fg: '#ffffff' }, where: 'Red building behind the roundabout', source: SV },
  { id: 'kfc', text: ['KFC'], colors: { bg: '#c62828', fg: '#ffffff' }, where: 'Building on the east side of Ayangburen Road, about 520 m south of the roundabout (lettering only)', source: SV },
  { id: 'paypoint', text: ['REVENUE', 'PAY POINT'], colors: { bg: '#c62828', fg: '#ffffff' }, where: 'Hospital covered walkway', source: SV },
  { id: 'tailoring', text: ['TAILORING', 'WEDDING SUITS', 'FASHION'], colors: { bg: '#1f5fb0', fg: '#ffffff' }, where: 'Blue board on the east side of Ayangburen Road', source: 'Street View, words read; first letters of some lines cut off' },
];

/** The real signs to draw for a track: none unless it is Ikorodu with real signage. */
export function signsFor(cfg: TrackConfig): Sign[] {
  return cfg.id === 'ikorodu' && cfg.signage === 'real' ? IKORODU_SIGNS : [];
}
