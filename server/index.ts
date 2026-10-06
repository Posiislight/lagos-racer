import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { MAX_MESSAGE_BYTES } from '../src/net/protocol';
import { verifyToken } from '@clerk/backend';
import { Pool } from 'pg';
import * as Sentry from '@sentry/node';
import { RoomServer } from './rooms';
import { PgSaveStore, handleSaveRequest, type SaveDeps } from './saves';
import { PgPurchaseStore, createPaystackApi, handlePayRequest, type PayDeps } from './paystack';
import { PgLeaderboardStore, handleLeaderboardRequest, type LeaderboardDeps, type LeaderboardStore } from './leaderboard';
import { entriesFromResults } from '../src/game/leaderboard';

// Error reporting runs on Render (which sets RENDER) or wherever SENTRY_DSN is set, so local dev sends nothing. The uncaught-exception integrations are left out because the
// handlers below already keep the process alive; they report to Sentry themselves.
Sentry.init({
  dsn: process.env.SENTRY_DSN ?? (process.env.RENDER ? 'https://5de5a0122cb78a2c92bd8347f4ed2f92@o4509816762138624.ingest.us.sentry.io/4512205375602688' : undefined),
  environment: process.env.SENTRY_ENVIRONMENT ?? 'production',
  release: process.env.SENTRY_RELEASE ?? process.env.RENDER_GIT_COMMIT,
  tracesSampleRate: 0,
  integrations: (defaults) => defaults.filter((i) => i.name !== 'OnUncaughtException' && i.name !== 'OnUnhandledRejection'),
});

const port = Number(process.env.PORT ?? 8787);
// Null until Postgres is ready; a finished Quick race is then recorded for the leaderboard. A fault there is logged, never raised into the race.
let leaderboard: LeaderboardStore | null = null;
const rooms = new RoomServer({
  onQuickResults: (trackId, results) => {
    const store = leaderboard;
    if (!store) return;
    store.record(trackId, entriesFromResults(results), Date.now()).catch((err) => {
      console.error('leaderboard record failed', err);
      Sentry.captureException(err, { tags: { where: 'leaderboard' } });
    });
  },
});

// One bad message or room must not take every other race down with it: log, and keep serving.
process.on('uncaughtException', (err) => { console.error('uncaught exception', err); Sentry.captureException(err); });
process.on('unhandledRejection', (err) => { console.error('unhandled rejection', err); Sentry.captureException(err); });

/** Runs fn, logging instead of throwing. */
function guard(what: string, fn: () => void) {
  try {
    fn();
  } catch (err) {
    console.error(`${what} failed`, err);
    Sentry.captureException(err, { tags: { where: what } });
  }
}

// Cloud saves need a Postgres database and Clerk's secret key; without them /save answers 503 or 401 and rooms run as before.
const saveDeps: SaveDeps = {
  store: null,
  allowedOrigins: ['http://localhost:5173', 'http://localhost:5174', ...(process.env.ALLOWED_ORIGIN ?? '').split(',').map(o => o.trim()).filter(Boolean)],
  verify: async (token) => {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) return null;
    try { return (await verifyToken(token, { secretKey })).sub; } catch { return null; }
  },
};
// Gem purchases (Paystack) share the database. They need no account: a purchase belongs to the phone that made it. Without PAYSTACK_SECRET_KEY the /pay routes answer 503 and nothing can be bought.
const payDeps: PayDeps = {
  store: null,
  paystack: process.env.PAYSTACK_SECRET_KEY ? createPaystackApi(process.env.PAYSTACK_SECRET_KEY) : null,
  secretKey: process.env.PAYSTACK_SECRET_KEY ?? null,
  allowedOrigins: saveDeps.allowedOrigins,
};
// The boards are public reads; without a database /leaderboard answers 503.
const leaderboardDeps: LeaderboardDeps = { store: null, allowedOrigins: saveDeps.allowedOrigins };
if (process.env.PAYSTACK_SECRET_KEY && !process.env.DATABASE_URL) console.warn('PAYSTACK_SECRET_KEY is set but DATABASE_URL is not: every /pay request will be refused');
if (process.env.DATABASE_URL && !process.env.CLERK_SECRET_KEY) console.warn('DATABASE_URL is set but CLERK_SECRET_KEY is not: every /save request will be refused');
if (process.env.DATABASE_URL) {
  const pg = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false } });
  // An idle connection dropped by Postgres emits 'error' on the pool; unhandled, it would end the process and every race with it.
  pg.on('error', (err) => console.error('pg pool error', err));
  const store = new PgSaveStore(pg);
  // Postgres may come up after this service does: keep trying until the table is ready (saves answer 503 meanwhile).
  const purchases = new PgPurchaseStore(pg);
  const board = new PgLeaderboardStore(pg);
  const init = () => Promise.all([store.ensureSchema(), purchases.ensureSchema(), board.ensureSchema()]).then(
    () => { saveDeps.store = store; payDeps.store = purchases; leaderboard = board; leaderboardDeps.store = board; console.log('cloud saves and leaderboard ready'); },
    (err) => { console.error('cloud saves unavailable, retrying in 10s', err.message); setTimeout(init, 10_000); },
  );
  void init();
}

const http = createServer((req, res) => {
  const path = (req.url ?? '').split('?')[0];
  if (path === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
  } else if (path === '/save') {
    handleSaveRequest(req, res, saveDeps).catch((err) => {
      console.error('save request failed', err);
      Sentry.captureException(err, { tags: { where: 'save' } });
      if (!res.headersSent) res.writeHead(500).end();
    });
  } else if (path.startsWith('/pay/')) {
    handlePayRequest(req, res, payDeps).catch((err) => {
      console.error('pay request failed', err);
      Sentry.captureException(err, { tags: { where: 'pay' } });
      if (!res.headersSent) res.writeHead(500).end();
    });
  } else if (path.startsWith('/leaderboard/')) {
    handleLeaderboardRequest(req, res, leaderboardDeps).catch((err) => {
      console.error('leaderboard request failed', err);
      Sentry.captureException(err, { tags: { where: 'leaderboard' } });
      if (!res.headersSent) res.writeHead(500).end();
    });
  } else {
    res.writeHead(404).end();
  }
});

const wss = new WebSocketServer({ server: http, maxPayload: MAX_MESSAGE_BYTES });

wss.on('connection', (ws, req) => {
  const id = rooms.open({
    send: (data) => ws.send(data),
    close: (dead) => (dead ? ws.terminate() : ws.close()),
  });
  ws.on('message', (raw, isBinary) => guard('message', () => {
    if (!isBinary) return rooms.message(id, raw.toString());
    // ws hands over pooled Buffers, so slice out exactly this frame's bytes.
    const buf = raw as Buffer;
    rooms.message(id, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
  }));
  const openedAt = Date.now();
  console.log(`socket ${id} open origin=${req.headers.origin ?? '-'}`);
  ws.on('close', (code, reason) => guard('close', () => {
    console.log(`socket ${id} closed code=${code} reason=${reason.toString() || '-'} after=${Date.now() - openedAt}ms ${rooms.describe(id)}`);
    rooms.close(id);
  }));
  // Oversize or malformed frames error before closing; the close handler does the cleanup.
  ws.on('error', (err) => console.warn(`socket ${id} error:`, err.message));
});

wss.on('error', (err) => console.error('websocket server error', err));

setInterval(() => guard('tick', () => rooms.tick()), 250);

http.listen(port, () => console.log(`room server listening on :${port}`));
