import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { MAX_MESSAGE_BYTES } from '../src/net/protocol';
import { verifyToken } from '@clerk/backend';
import { Pool } from 'pg';
import { RoomServer } from './rooms';
import { PgSaveStore, handleSaveRequest, type SaveDeps } from './saves';

const port = Number(process.env.PORT ?? 8787);
const rooms = new RoomServer();

// One bad message or room must not take every other race down with it: log, and keep serving.
process.on('uncaughtException', (err) => console.error('uncaught exception', err));
process.on('unhandledRejection', (err) => console.error('unhandled rejection', err));

/** Runs fn, logging instead of throwing. */
function guard(what: string, fn: () => void) {
  try {
    fn();
  } catch (err) {
    console.error(`${what} failed`, err);
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
if (process.env.DATABASE_URL && !process.env.CLERK_SECRET_KEY) console.warn('DATABASE_URL is set but CLERK_SECRET_KEY is not: every /save request will be refused');
if (process.env.DATABASE_URL) {
  const pg = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false } });
  // An idle connection dropped by Postgres emits 'error' on the pool; unhandled, it would end the process and every race with it.
  pg.on('error', (err) => console.error('pg pool error', err));
  const store = new PgSaveStore(pg);
  // Postgres may come up after this service does: keep trying until the table is ready (saves answer 503 meanwhile).
  const init = () => store.ensureSchema().then(
    () => { saveDeps.store = store; console.log('cloud saves ready'); },
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
      if (!res.headersSent) res.writeHead(500).end();
    });
  } else {
    res.writeHead(404).end();
  }
});

const wss = new WebSocketServer({ server: http, maxPayload: MAX_MESSAGE_BYTES });

wss.on('connection', (ws) => {
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
  ws.on('close', () => guard('close', () => rooms.close(id)));
  // Oversize or malformed frames error before closing; the close handler does the cleanup.
  ws.on('error', (err) => console.warn(`socket ${id} error:`, err.message));
});

wss.on('error', (err) => console.error('websocket server error', err));

setInterval(() => guard('tick', () => rooms.tick()), 250);

http.listen(port, () => console.log(`room server listening on :${port}`));
