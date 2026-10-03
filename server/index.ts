import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { MAX_MESSAGE_BYTES } from '../src/net/protocol';
import { RoomServer } from './rooms';

const port = Number(process.env.PORT ?? 8787);
const rooms = new RoomServer();

const http = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
  } else {
    res.writeHead(404).end();
  }
});

const wss = new WebSocketServer({ server: http, maxPayload: MAX_MESSAGE_BYTES });

wss.on('connection', (ws) => {
  const id = rooms.open({
    send: (data) => ws.send(data),
    close: () => ws.close(),
  });
  ws.on('message', (raw, isBinary) => {
    if (!isBinary) return rooms.message(id, raw.toString());
    // ws hands over pooled Buffers, so slice out exactly this frame's bytes.
    const buf = raw as Buffer;
    rooms.message(id, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
  });
  ws.on('close', () => rooms.close(id));
  // Oversize or malformed frames error before closing; the close handler does the cleanup.
  ws.on('error', () => {});
});

setInterval(() => rooms.tick(), 250);

http.listen(port, () => console.log(`room server listening on :${port}`));
