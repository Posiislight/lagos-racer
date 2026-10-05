export const MENU_TAGLINE = 'Race the streets of Lagos';

/** The map-data credit for the menu footer, or null when no track needs one. */
export const menuCredit = (tracks: { credit?: string }[]): string | null =>
  tracks.find(t => t.credit)?.credit ?? null;
