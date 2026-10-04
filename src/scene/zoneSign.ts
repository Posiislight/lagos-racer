import type { TrackConfig } from '../config/tracks';
import { signsFor, type Sign } from '../config/signs/ikorodu';

/** The real sign with this id for a track, or undefined (generic signage, or no such verified sign). */
export const zoneSign = (cfg: TrackConfig, id: string): Sign | undefined => signsFor(cfg).find(s => s.id === id);
