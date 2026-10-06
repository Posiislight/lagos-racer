// Fill the leaderboard with made-up players so it is not empty. Rows are flagged is_seed and drop off the boards by themselves
// once 20 real players are on one; a real player using a seeded nickname replaces it.
// Usage: DATABASE_URL=... npm run seed:leaderboard           (replace the seeded rows with a fresh set)
//        DATABASE_URL=... npm run seed:leaderboard -- --clear (remove every seeded row)
import { Pool } from 'pg';
import { PgLeaderboardStore } from '../server/leaderboard';
import { makeSeeds } from '../server/leaderboardSeeds';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
const pool = new Pool({ connectionString: url, ssl: url.includes('localhost') ? false : { rejectUnauthorized: false } });
const store = new PgLeaderboardStore(pool);

try {
  await store.ensureSchema();
  await store.clearSeeds();
  if (process.argv.includes('--clear')) {
    console.log('removed every seeded row');
  } else {
    const rows = makeSeeds(Math.random, Date.now());
    await store.seed(rows);
    console.log(`seeded ${new Set(rows.map(r => r.key)).size} players (${rows.length} time rows)`);
  }
} finally {
  await pool.end();
}
