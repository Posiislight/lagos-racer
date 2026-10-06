/** Points for finishing a Quick race, by place (1st first). Nothing below the last entry. */
export const POINTS_BY_PLACE: readonly number[] = [10, 7, 5, 3, 1, 1];

/** Rows on a board. */
export const BOARD_SIZE = 50;

/** Seeded rows are hidden once a board holds this many real rows. */
export const SEED_HIDE_AT = 20;

/** How long the server reuses a board before asking Postgres again. */
export const CACHE_MS = 30_000;
