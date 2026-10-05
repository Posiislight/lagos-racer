import { beforeEach, describe, expect, it } from 'vitest';
import { RoomServer, type Peer } from './rooms';
import { Room } from './room';
import { BOT_NAMES } from './bots';
import { TRACKS, trackById } from '../src/config/tracks';
import { vehicleById } from '../src/config/vehicles';
import { maxTopSpeed } from '../src/game/upgrades';
import { buildTrack, sampleAt } from '../src/game/track';
import {
  FINISH_CUTOFF_MS,
  LOAD_TIMEOUT_MS,
  LOBBY_GRACE_MS,
  LOBBY_SILENCE_MS,
  BOT_SLOT_BASE,
  QUICK_WAIT_MS,
  SILENCE_MS,
  RECONNECT_GRACE_MS,
  ROOM_IDLE_MS,
  START_LEAD_MS,
  encodeSnapshot,
  type CarState,
  type ServerMessage,
  type Snapshot,
} from '../src/net/protocol';

class FakePeer implements Peer {
  sent: (string | ArrayBuffer)[] = [];
  closed = false;
  dead = false;
  send(data: string | ArrayBuffer) {
    this.sent.push(data);
  }
  close(dead = false) {
    this.closed = true;
    this.dead ||= dead;
  }
}

function msgs<T extends ServerMessage['t']>(peer: FakePeer, t: T): Extract<ServerMessage, { t: T }>[] {
  return peer.sent
    .filter((d): d is string => typeof d === 'string')
    .map(d => JSON.parse(d) as ServerMessage)
    .filter((m): m is Extract<ServerMessage, { t: T }> => m.t === t);
}

let now = 0;
let server: RoomServer;

beforeEach(() => {
  now = 1_000_000;
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // Most tests jump the clock without pings; the liveness tests below build a server that checks for silence.
  server = new RoomServer({ now: () => now, random, liveness: false });
});

const withLiveness = () => {
  server = new RoomServer({ now: () => now });
};
/** Advances the clock in steps of at most 5 s, with only `alive` pinging. */
function quiet(ms: number, alive: number[]) {
  for (let t = 0; t < ms; t += 5000) {
    now += Math.min(5000, ms - t);
    for (const conn of alive) send(conn, { t: 'ping', c: t });
    server.tick();
  }
}

function connect() {
  const peer = new FakePeer();
  return { peer, conn: server.open(peer) };
}

function send(conn: number, m: object) {
  server.message(conn, JSON.stringify(m));
}

function create(name = 'Ade') {
  const c = connect();
  send(c.conn, { t: 'create', name, vehicle: 'okada' });
  return { ...c, welcome: msgs(c.peer, 'welcome')[0] };
}

function join(code: string, name = 'Bola') {
  const c = connect();
  send(c.conn, { t: 'join', code, name, vehicle: 'keke' });
  return c;
}

const lastRoom = (peer: FakePeer) => msgs(peer, 'room').at(-1)!.room;

describe('RoomServer', () => {
  it('creates a room with a 4-letter code and makes the creator host in slot 1', () => {
    const a = create();
    expect(a.welcome.code).toMatch(/^[A-HJ-NP-Z]{4}$/);
    expect(a.welcome.slot).toBe(1);
    expect(a.welcome.token).toHaveLength(24);
    const room = lastRoom(a.peer);
    expect(room.hostSlot).toBe(1);
    expect(room.code).toBe(a.welcome.code);
    expect(room.players).toEqual([{ slot: 1, name: 'Ade', vehicle: 'okada', paint: 'yellow', ready: false, connected: true }]);
  });

  it('gives different codes to different rooms even if random repeats', () => {
    server = new RoomServer({ now: () => now, random: () => 0 });
    const a = create();
    const b = create();
    expect(a.welcome.code).not.toBe(b.welcome.code);
  });

  it('joins by code case- and space-insensitively', () => {
    const a = create();
    const b = join(` ${a.welcome.code.toLowerCase()} `);
    expect(msgs(b.peer, 'welcome')[0].slot).toBe(2);
    expect(lastRoom(a.peer).players.map(p => p.slot)).toEqual([1, 2]);
    expect(lastRoom(b.peer).players[1].name).toBe('Bola');
  });

  it('rejects unknown codes, a 7th human, and joins after the race started', () => {
    expect(msgs(join('ZZZZ').peer, 'error')[0].error).toBe('not-found');
    expect(msgs(join('x').peer, 'error')[0].error).toBe('bad-code');

    const a = create();
    for (let i = 0; i < 5; i++) expect(msgs(join(a.welcome.code).peer, 'welcome')).toHaveLength(1);
    expect(msgs(join(a.welcome.code).peer, 'error')[0].error).toBe('full');

    const b = create();
    server.rooms.get(b.welcome.code)!.phase = 'racing';
    expect(msgs(join(b.welcome.code).peer, 'error')[0].error).toBe('started');
  });

  it('rejects blank nicknames with bad-name', () => {
    const blank = create('  \u0007 ');
    expect(msgs(blank.peer, 'error')[0].error).toBe('bad-name');
    expect(server.rooms.size).toBe(0);

    const a = create();
    expect(msgs(join(a.welcome.code, '   ').peer, 'error')[0].error).toBe('bad-name');
  });

  it('drops malformed or wrongly typed messages without crashing', () => {
    const c = connect();
    for (const bad of [
      'not json',
      '[]',
      'null',
      '{"t":"nope"}',
      '{"t":"create","name":5,"vehicle":"okada"}',
      '{"t":"create","name":"Ade","vehicle":"hovercraft"}',
      '{"t":"create","name":"Ade"}',
      '{"t":"join","code":7,"name":"Ade","vehicle":"okada"}',
      '{"t":"resume","token":{}}',
      '{"t":"ping","c":"x"}',
      '{"t":"lobby","ready":"yes"}',
    ]) server.message(c.conn, bad);
    server.message(c.conn, new ArrayBuffer(8));
    expect(c.peer.sent).toHaveLength(0);
    expect(server.rooms.size).toBe(0);
  });

  it('resumes a dropped player into the same slot with their token', () => {
    const a = create();
    const b = join(a.welcome.code);
    const token = msgs(b.peer, 'welcome')[0].token;

    server.close(b.conn);
    expect(lastRoom(a.peer).players[1].connected).toBe(false);

    now += 5000;
    const b2 = connect();
    send(b2.conn, { t: 'resume', token });
    expect(msgs(b2.peer, 'welcome')[0]).toEqual({ t: 'welcome', code: a.welcome.code, slot: 2, token });
    expect(lastRoom(b2.peer).players[1].connected).toBe(true);
    expect(lastRoom(a.peer).players[1].connected).toBe(true);

    // The old connection closing late must not drop the resumed player.
    server.close(b.conn);
    expect(lastRoom(a.peer).players[1].connected).toBe(true);
    now += RECONNECT_GRACE_MS + 1;
    server.tick();
    expect(server.rooms.get(a.welcome.code)!.view().players).toHaveLength(2);
  });

  it('takes over a member whose old socket is still open', () => {
    const a = create();
    const token = a.welcome.token;
    const a2 = connect();
    send(a2.conn, { t: 'resume', token });
    expect(msgs(a2.peer, 'welcome')).toHaveLength(1);
    expect(a.peer.closed).toBe(true);
    server.close(a.conn);
    expect(lastRoom(a2.peer).players[0].connected).toBe(true);
  });

  it('expires an unknown token', () => {
    const c = connect();
    send(c.conn, { t: 'resume', token: 'nope' });
    expect(msgs(c.peer, 'error')[0].error).toBe('expired');
  });

  it('in the lobby, frees the slot after 120 s without a resume and hands host to the lowest slot', () => {
    const a = create();
    const b = join(a.welcome.code);
    join(a.welcome.code);
    server.close(a.conn);
    // Long enough to go and share the room link in another app.
    now += LOBBY_GRACE_MS - 1;
    server.tick();
    expect(lastRoom(b.peer).players.map(p => p.slot)).toEqual([1, 2, 3]);

    now += 2;
    server.tick();
    const room = lastRoom(b.peer);
    expect(room.players.map(p => p.slot)).toEqual([2, 3]);
    expect(room.hostSlot).toBe(2);

    const late = connect();
    send(late.conn, { t: 'resume', token: a.welcome.token });
    expect(msgs(late.peer, 'error')[0].error).toBe('expired');
  });

  it('removes a member at once on leave, hands host on, and reuses the lowest free slot', () => {
    const a = create();
    const b = join(a.welcome.code);
    join(a.welcome.code);
    send(a.conn, { t: 'leave' });
    const room = lastRoom(b.peer);
    expect(room.players.map(p => p.slot)).toEqual([2, 3]);
    expect(room.hostSlot).toBe(2);
    const d = join(a.welcome.code, 'Dayo');
    expect(msgs(d.peer, 'welcome')[0].slot).toBe(1);
  });

  it('hands host to a connected player, not one in grace', () => {
    const a = create();
    const b = join(a.welcome.code);
    const c = join(a.welcome.code);
    server.close(b.conn);
    send(a.conn, { t: 'leave' });
    expect(lastRoom(c.peer).hostSlot).toBe(3);
  });

  it('sets vehicle and ready, and broadcasts to connected members', () => {
    const a = create();
    const b = join(a.welcome.code);
    send(b.conn, { t: 'lobby', vehicle: 'danfo', ready: true });
    for (const p of [a.peer, b.peer]) {
      expect(lastRoom(p).players[1]).toMatchObject({ vehicle: 'danfo', ready: true });
    }
  });

  it('only the host can toggle fillAI', () => {
    const a = create();
    const b = join(a.welcome.code);
    send(b.conn, { t: 'lobby', fillAI: true });
    expect(msgs(b.peer, 'error')[0].error).toBe('not-host');
    expect(lastRoom(a.peer).fillAI).toBe(false);
    send(a.conn, { t: 'lobby', fillAI: true });
    expect(lastRoom(b.peer).fillAI).toBe(true);
  });

  it('ignores lobby messages once the room is past the lobby', () => {
    const a = create();
    server.rooms.get(a.welcome.code)!.phase = 'racing';
    const before = msgs(a.peer, 'room').length;
    send(a.conn, { t: 'lobby', ready: true });
    expect(msgs(a.peer, 'room')).toHaveLength(before);
  });

  it('drops messages over 4096 bytes and beyond 30 per second', () => {
    const c = connect();
    server.message(c.conn, JSON.stringify({ t: 'ping', c: 1, pad: 'x'.repeat(5000) }));
    expect(msgs(c.peer, 'pong')).toHaveLength(0);

    for (let i = 0; i < 40; i++) send(c.conn, { t: 'ping', c: i });
    expect(msgs(c.peer, 'pong')).toHaveLength(30);

    now += 1000;
    send(c.conn, { t: 'ping', c: 99 });
    expect(msgs(c.peer, 'pong')).toHaveLength(31);
  });

  it('deletes a room idle for 10 minutes and when its last member leaves', () => {
    const a = create();
    now += ROOM_IDLE_MS - 1;
    server.tick();
    expect(server.rooms.size).toBe(1);
    now += 1;
    server.tick();
    expect(server.rooms.size).toBe(0);
    expect(a.peer.closed).toBe(true);
    server.close(a.conn);

    const b = create();
    send(b.conn, { t: 'leave' });
    expect(server.rooms.size).toBe(0);

    const c = create();
    server.close(c.conn);
    now += LOBBY_GRACE_MS;
    server.tick();
    expect(server.rooms.size).toBe(0);
  });

  it('keeps a room alive while members send lobby messages', () => {
    const a = create();
    now += ROOM_IDLE_MS - 1;
    send(a.conn, { t: 'lobby', ready: true });
    now += ROOM_IDLE_MS - 1;
    server.tick();
    expect(server.rooms.size).toBe(1);
  });

  it('answers ping with the client time and server time', () => {
    const c = connect();
    send(c.conn, { t: 'ping', c: 123 });
    expect(msgs(c.peer, 'pong')[0]).toEqual({ t: 'pong', c: 123, s: now });
  });

  it('in the lobby, closes a connection only after 90 s of silence, and keeps its seat for 120 s', () => {
    withLiveness();
    const a = create();
    const b = join(a.welcome.code);
    const room = server.rooms.get(a.welcome.code)!;
    // b is off in another app sharing the link; a keeps pinging.
    quiet(LOBBY_SILENCE_MS - 1, [a.conn]);
    expect(b.peer.closed).toBe(false);
    quiet(1, [a.conn]);
    expect(a.peer.closed).toBe(false);
    expect(b.peer.closed).toBe(true);
    expect(b.peer.dead).toBe(true);
    expect(lastRoom(a.peer).players.map(p => [p.slot, p.connected])).toEqual([[1, true], [2, false]]);
    // A closed connection says nothing more.
    const sent = b.peer.sent.length;
    send(b.conn, { t: 'ping', c: 1 });
    expect(b.peer.sent).toHaveLength(sent);
    quiet(LOBBY_GRACE_MS - 5000, [a.conn]);
    expect(room.size).toBe(2);
    const back = connect();
    send(back.conn, { t: 'resume', token: msgs(b.peer, 'welcome')[0].token });
    expect(msgs(back.peer, 'welcome')[0].slot).toBe(2);
  });

  it('in a race, closes a connection silent for 12 s', () => {
    withLiveness();
    const { a, b, c, d2 } = racers();
    for (const p of [a, b, c, d2]) send(p.conn, { t: 'ping', c: 0 });
    quiet(SILENCE_MS - 1, [a.conn, c.conn, d2.conn]);
    expect(b.peer.closed).toBe(false);
    quiet(1, [a.conn, c.conn, d2.conn]);
    expect(b.peer.closed).toBe(true);
    expect(a.peer.closed).toBe(false);
  });

  it('keeps a quiet connection open until 12 s have passed', () => {
    withLiveness();
    const c = connect();
    now += 11_999;
    server.tick();
    expect(c.peer.closed).toBe(false);
    send(c.conn, { t: 'ping', c: 1 });
    now += 11_999;
    server.tick();
    expect(c.peer.closed).toBe(false);
    now += 1;
    server.tick();
    expect(c.peer.closed).toBe(true);
  });

  it('closes a connection that never creates, joins or resumes within 30 s, even if it pings', () => {
    withLiveness();
    const idle = connect();
    const seated = create();
    send(seated.conn, { t: 'leave' });
    for (let t = 0; t < 6; t++) {
      now += 5000;
      for (const p of [idle, seated]) send(p.conn, { t: 'ping', c: t });
      server.tick();
    }
    expect(idle.peer.closed).toBe(true);
    // Once seated, leaving the room does not start that clock again.
    expect(seated.peer.closed).toBe(false);
  });

  it('refuses create or join from a connection already in a room', () => {
    const a = create();
    send(a.conn, { t: 'create', name: 'Again', vehicle: 'okada' });
    send(a.conn, { t: 'join', code: a.welcome.code, name: 'Again', vehicle: 'okada' });
    expect(server.rooms.size).toBe(1);
    expect(lastRoom(a.peer).players).toHaveLength(1);
  });
});

describe('race start', () => {
  /** A host and a second human, both ready to go. */
  function pair() {
    const a = create();
    const b = join(a.welcome.code);
    send(a.conn, { t: 'lobby', ready: true });
    send(b.conn, { t: 'lobby', ready: true });
    return { a, b, room: server.rooms.get(a.welcome.code)! };
  }

  it('start needs the host, two humans and everyone ready', () => {
    const solo = create();
    send(solo.conn, { t: 'lobby', ready: true });
    send(solo.conn, { t: 'start' });
    expect(msgs(solo.peer, 'error')[0].error).toBe('not-ready');

    const a = create();
    const b = join(a.welcome.code);
    send(b.conn, { t: 'start' });
    expect(msgs(b.peer, 'error')[0].error).toBe('not-host');

    send(a.conn, { t: 'lobby', ready: true });
    send(a.conn, { t: 'start' });
    expect(msgs(a.peer, 'error')[0].error).toBe('not-ready');
    expect(msgs(a.peer, 'grid')).toHaveLength(0);
    expect(server.rooms.get(a.welcome.code)!.phase).toBe('lobby');
  });

  it('broadcasts grid with a new raceSeq and seed, and phase loading', () => {
    const { a, b, room } = pair();
    send(a.conn, { t: 'start' });
    expect(room.phase).toBe('loading');
    expect(room.raceSeq).toBe(1);
    for (const p of [a.peer, b.peer]) {
      const [g] = msgs(p, 'grid');
      expect(g).toMatchObject({ t: 'grid', raceSeq: 1, trackId: 'ojuelegba', laps: 3 });
      expect(Number.isInteger(g.seed) && g.seed >= 0 && g.seed < 2 ** 32).toBe(true);
      expect(g.grid).toEqual([
        { netId: 0, slot: 1, name: 'Ade', vehicle: 'okada', paint: 'yellow', ai: false },
        { netId: 1, slot: 2, name: 'Bola', vehicle: 'keke', paint: 'yellow', ai: false },
      ]);
    }
    expect(msgs(a.peer, 'grid')[0].seed).toBe(msgs(b.peer, 'grid')[0].seed);
  });

  it('fills the grid with host-owned AI when fillAI is on', () => {
    const { a, b } = pair();
    send(a.conn, { t: 'lobby', fillAI: true });
    send(a.conn, { t: 'start' });
    const grid = msgs(b.peer, 'grid')[0].grid;
    expect(grid).toHaveLength(6);
    expect(grid.filter(e => e.ai).every(e => e.slot === 1)).toBe(true);
    expect(grid.filter(e => !e.ai).map(e => e.slot)).toEqual([1, 2]);
  });

  it('when the host drops for 15 s mid-race, their AI cars are DNF too', () => {
    const { a, b } = pair();
    send(a.conn, { t: 'lobby', fillAI: true });
    send(a.conn, { t: 'start' });
    for (const p of [a, b]) send(p.conn, { t: 'loaded' });
    now += START_LEAD_MS;
    server.tick();
    server.close(a.conn);
    now += RECONNECT_GRACE_MS;
    server.tick();
    // AI cars 0-3 and the host's own car 4; the guest (5) races on.
    expect(msgs(b.peer, 'dnf')).toEqual([{ t: 'dnf', netIds: [0, 1, 2, 3, 4] }]);
  });

  it('re-sends grid and start to a grid player who resumes, after welcome and room', () => {
    const { a, b, room } = pair();
    send(a.conn, { t: 'start' });
    send(a.conn, { t: 'loaded' });
    // b drops while loading, so the start goes out without them.
    server.close(b.conn);
    server.tick();
    const [start] = msgs(a.peer, 'start');
    expect(start).toBeDefined();
    expect(msgs(b.peer, 'start')).toHaveLength(0);

    now += 2000;
    const b2 = connect();
    send(b2.conn, { t: 'resume', token: msgs(b.peer, 'welcome')[0].token });
    const kinds = b2.peer.sent.map(d => (JSON.parse(d as string) as ServerMessage).t);
    expect(kinds).toEqual(['welcome', 'room', 'grid', 'start']);
    expect(msgs(b2.peer, 'grid')).toEqual(msgs(b.peer, 'grid'));
    expect(msgs(b2.peer, 'start')).toEqual([start]);
    expect(room.phase).toBe('countdown');
  });

  it('re-sends only the grid to a grid player who resumes while still loading', () => {
    const { a, b } = pair();
    send(a.conn, { t: 'start' });
    server.close(b.conn);
    const b2 = connect();
    send(b2.conn, { t: 'resume', token: msgs(b.peer, 'welcome')[0].token });
    expect(msgs(b2.peer, 'grid')).toEqual(msgs(b.peer, 'grid'));
    expect(msgs(b2.peer, 'start')).toHaveLength(0);
  });

  it('ignores a second start once the race has begun', () => {
    const { a } = pair();
    send(a.conn, { t: 'start' });
    send(a.conn, { t: 'start' });
    expect(msgs(a.peer, 'grid')).toHaveLength(1);
  });

  it('sends start 3.5 s ahead once everyone has loaded', () => {
    const { a, b, room } = pair();
    send(a.conn, { t: 'start' });
    send(a.conn, { t: 'loaded' });
    send(a.conn, { t: 'loaded' });
    expect(msgs(a.peer, 'start')).toHaveLength(0);
    now += 400;
    send(b.conn, { t: 'loaded' });
    for (const p of [a.peer, b.peer]) {
      expect(msgs(p, 'start')).toEqual([{ t: 'start', raceSeq: 1, at: now + START_LEAD_MS }]);
    }
    expect(room.phase).toBe('countdown');
    send(a.conn, { t: 'loaded' });
    expect(msgs(a.peer, 'start')).toHaveLength(1);
  });

  it('sends start after 20 s even if someone never loads', () => {
    const { a, room } = pair();
    send(a.conn, { t: 'start' });
    send(a.conn, { t: 'loaded' });
    now += LOAD_TIMEOUT_MS - 1;
    server.tick();
    expect(msgs(a.peer, 'start')).toHaveLength(0);
    now += 1;
    server.tick();
    expect(msgs(a.peer, 'start')).toEqual([{ t: 'start', raceSeq: 1, at: now + START_LEAD_MS }]);
    expect(room.phase).toBe('countdown');
  });

  it('leaves a reconnecting player out of the grid', () => {
    const a = create();
    const b = join(a.welcome.code);
    const c = join(a.welcome.code, 'Chidi');
    for (const p of [a, b, c]) send(p.conn, { t: 'lobby', ready: true });
    server.close(b.conn);
    send(a.conn, { t: 'start' });
    expect(msgs(a.peer, 'grid')[0].grid.map(e => e.slot)).toEqual([1, 3]);

    // The absent player never blocks the start, and resuming later does not add them.
    send(a.conn, { t: 'loaded' });
    send(c.conn, { t: 'loaded' });
    expect(msgs(a.peer, 'start')).toHaveLength(1);
    const b2 = connect();
    send(b2.conn, { t: 'resume', token: msgs(b.peer, 'welcome')[0].token });
    send(b2.conn, { t: 'loaded' });
    expect(msgs(b2.peer, 'start')).toHaveLength(0);
  });

  it('does not wait for a grid player who drops while loading', () => {
    const { a, b } = pair();
    send(a.conn, { t: 'start' });
    send(a.conn, { t: 'loaded' });
    server.close(b.conn);
    server.tick();
    expect(msgs(a.peer, 'start')).toHaveLength(1);
  });

  it('ignores loaded outside the loading phase', () => {
    const { a, b } = pair();
    send(a.conn, { t: 'loaded' });
    send(b.conn, { t: 'loaded' });
    send(a.conn, { t: 'start' });
    server.tick();
    expect(msgs(a.peer, 'start')).toHaveLength(0);
  });

  it('moves to racing when the start time passes', () => {
    const { a, b, room } = pair();
    send(a.conn, { t: 'start' });
    send(a.conn, { t: 'loaded' });
    send(b.conn, { t: 'loaded' });
    now += START_LEAD_MS - 1;
    server.tick();
    expect(room.phase).toBe('countdown');
    now += 1;
    server.tick();
    expect(room.phase).toBe('racing');
  });

  it('refuses new joiners once loading has begun', () => {
    const { a } = pair();
    send(a.conn, { t: 'start' });
    expect(msgs(join(a.welcome.code).peer, 'error')[0].error).toBe('started');
  });
});

/** Three humans on the grid (slots 1-3, netIds 0-2) and a fourth who dropped before the start. */
function racers(phase: 'countdown' | 'racing' = 'racing') {
  const a = create();
  const b = join(a.welcome.code);
  const c = join(a.welcome.code, 'Chidi');
  const d = join(a.welcome.code, 'Dayo');
  for (const p of [a, b, c, d]) send(p.conn, { t: 'lobby', ready: true });
  server.close(d.conn);
  send(a.conn, { t: 'start' });
  for (const p of [a, b, c]) send(p.conn, { t: 'loaded' });
  const room = server.rooms.get(a.welcome.code)!;
  if (phase === 'racing') {
    now += START_LEAD_MS;
    server.tick();
  }
  expect(room.phase).toBe(phase);
  const d2 = connect();
  send(d2.conn, { t: 'resume', token: msgs(d.peer, 'welcome')[0].token });
  return { a, b, c, d2, room };
}

describe('snapshot relay', () => {
  const car = (netId: number, over: Partial<CarState> = {}): CarState => ({
    netId, x: 1, y: 0.5, z: -3, qx: 0, qy: 0, qz: 0, qw: 1, vx: 0, vy: 0, vz: 12, distance: 40, laps: 0, flags: 0, ...over,
  });
  const snap = (slot: number, over: Partial<Snapshot> = {}): Snapshot => ({ slot, raceSeq: 1, time: 2.5, cars: [car(slot - 1)], ...over });
  const binary = (peer: FakePeer) => peer.sent.filter((d): d is ArrayBuffer => typeof d !== 'string');

  it('forwards a valid snapshot byte-for-byte to the other racers only', () => {
    for (const phase of ['countdown', 'racing'] as const) {
      server = new RoomServer({ now: () => now });
      const { a, b, c, d2 } = racers(phase);
      const bytes = encodeSnapshot(snap(1));
      server.message(a.conn, bytes);
      for (const p of [b, c]) {
        expect(binary(p.peer)).toHaveLength(1);
        expect(new Uint8Array(binary(p.peer)[0])).toEqual(new Uint8Array(bytes));
      }
      expect(binary(a.peer)).toHaveLength(0);
      expect(binary(d2.peer)).toHaveLength(0);
    }
  });

  it('drops snapshots claiming another slot, another raceSeq, or a car the sender does not own', () => {
    const { a, b, c } = racers();
    server.message(a.conn, encodeSnapshot(snap(2)));
    server.message(a.conn, encodeSnapshot(snap(1, { raceSeq: 2 })));
    server.message(a.conn, encodeSnapshot(snap(1, { cars: [car(1)] })));
    server.message(a.conn, encodeSnapshot(snap(1, { cars: [car(0), car(2)] })));
    server.message(a.conn, encodeSnapshot(snap(1, { cars: [car(7)] })));
    server.message(a.conn, new ArrayBuffer(3));
    expect(binary(b.peer)).toHaveLength(0);
    expect(binary(c.peer)).toHaveLength(0);
  });

  it('compares raceSeq modulo 256', () => {
    const { a, b, room } = racers();
    room.raceSeq = 257;
    server.message(a.conn, encodeSnapshot(snap(1, { raceSeq: 257 })));
    expect(binary(b.peer)).toHaveLength(1);
    server.message(a.conn, encodeSnapshot(snap(1, { raceSeq: 256 })));
    expect(binary(b.peer)).toHaveLength(1);
  });

  it('drops snapshots from a member who is not on the grid', () => {
    const { a, d2 } = racers();
    server.message(d2.conn, encodeSnapshot(snap(4, { cars: [] })));
    expect(binary(a.peer)).toHaveLength(0);
  });

  // Quaternion and velocity are int16 on the wire, so only the float32 fields can decode as non-finite.
  it('drops snapshots carrying NaN or infinite numbers', () => {
    const { a, b } = racers();
    for (const bad of [
      snap(1, { time: NaN }),
      snap(1, { cars: [car(0, { x: Infinity })] }),
      snap(1, { cars: [car(0, { y: NaN })] }),
      snap(1, { cars: [car(0, { z: -Infinity })] }),
      snap(1, { cars: [car(0, { distance: Infinity })] }),
    ]) server.message(a.conn, encodeSnapshot(bad));
    expect(binary(b.peer)).toHaveLength(0);
  });

  it('drops snapshots in the lobby and while loading', () => {
    const a = create();
    const b = join(a.welcome.code);
    server.message(a.conn, encodeSnapshot(snap(1)));
    expect(binary(b.peer)).toHaveLength(0);

    send(a.conn, { t: 'lobby', ready: true });
    send(b.conn, { t: 'lobby', ready: true });
    send(a.conn, { t: 'start' });
    server.message(a.conn, encodeSnapshot(snap(1)));
    expect(binary(b.peer)).toHaveLength(0);
  });

  it('does not let a connection outside a room relay anything', () => {
    const { a } = racers();
    const stranger = connect();
    server.message(stranger.conn, encodeSnapshot(snap(1)));
    expect(binary(a.peer)).toHaveLength(0);
  });

  it('counts relayed snapshots as activity, so a binary-only race is not reaped', () => {
    const { a, b, room } = racers();
    for (let i = 0; i < 11 * 60; i++) {
      now += 1000;
      server.message(a.conn, encodeSnapshot(snap(1)));
      server.tick();
    }
    expect(server.rooms.has(room.code)).toBe(true);
    expect(binary(b.peer)).toHaveLength(11 * 60);
  });

  it('does not count invalid snapshots or pings as activity', () => {
    const { a, room } = racers();
    now += ROOM_IDLE_MS - 1;
    server.message(a.conn, encodeSnapshot(snap(2)));
    send(a.conn, { t: 'ping', c: 1 });
    now += 1;
    server.tick();
    expect(server.rooms.has(room.code)).toBe(false);
  });
});

describe('item events', () => {
  const hazard = (over: Record<string, unknown> = {}) => ({
    id: 100005, kind: 'juju', x: 1, y: 2, z: 3, vx: 40, vy: 0, vz: 5, owner: 0, target: 1, life: 7, armed: 0.6, ground: 0.5, ...over,
  });
  const events = (peer: FakePeer) => [...msgs(peer, 'pickup'), ...msgs(peer, 'use'), ...msgs(peer, 'hit')];

  it('relays item events with from, and drops forged hazard ids and hits on cars not owned', () => {
    const { a, b, c, d2 } = racers();
    send(a.conn, { t: 'pickup', orb: 4 });
    send(a.conn, { t: 'use', hazard: hazard() });
    send(a.conn, { t: 'use', hazard: hazard({ id: 100006, kind: 'oil', target: null }) });
    send(b.conn, { t: 'hit', hazard: 100005, netId: 1 });
    for (const p of [b, c]) {
      expect(msgs(p.peer, 'pickup')).toEqual([{ t: 'pickup', orb: 4, from: 1 }]);
      expect(msgs(p.peer, 'use')).toEqual([
        { t: 'use', hazard: hazard(), from: 1 },
        { t: 'use', hazard: hazard({ id: 100006, kind: 'oil', target: null }), from: 1 },
      ]);
    }
    for (const p of [a, c]) expect(msgs(p.peer, 'hit')).toEqual([{ t: 'hit', hazard: 100005, netId: 1, from: 2 }]);
    expect(events(a.peer).filter(m => m.from === 1)).toHaveLength(0);
    expect(msgs(b.peer, 'hit')).toHaveLength(0);
    expect(events(d2.peer)).toHaveLength(0);

    const before = events(b.peer).length + events(c.peer).length;
    // Hazard ids outside the sender's block, cars it does not drive, bad targets and bad numbers.
    send(a.conn, { t: 'use', hazard: hazard({ id: 200000 }) });
    send(a.conn, { t: 'use', hazard: hazard({ id: 99999 }) });
    send(a.conn, { t: 'use', hazard: hazard({ id: 100000.5 }) });
    send(a.conn, { t: 'use', hazard: hazard({ owner: 1 }) });
    send(a.conn, { t: 'use', hazard: hazard({ target: 9 }) });
    send(a.conn, { t: 'use', hazard: hazard({ target: 'x' }) });
    send(a.conn, { t: 'use', hazard: hazard({ kind: 'fuel' }) });
    send(a.conn, { t: 'use', hazard: hazard({ x: null }) });
    send(a.conn, { t: 'use', hazard: hazard({ life: '7' }) });
    send(a.conn, { t: 'use', hazard: null });
    server.message(a.conn, JSON.stringify({ t: 'use', hazard: hazard() }).replace('"vx":40', '"vx":1e999'));
    send(a.conn, { t: 'hit', hazard: 100005, netId: 1 });
    send(a.conn, { t: 'hit', hazard: 100005, netId: 7 });
    send(a.conn, { t: 'hit', hazard: 1.5, netId: 0 });
    send(a.conn, { t: 'pickup', orb: -1 });
    send(a.conn, { t: 'pickup', orb: 2.5 });
    send(a.conn, { t: 'pickup', orb: '3' });
    expect(events(b.peer).length + events(c.peer).length).toBe(before);
  });

  it('caps how long a thrown hazard lives and arms, and drops ones far off the map or impossibly fast', () => {
    const { a, b } = racers();
    send(a.conn, { t: 'use', hazard: hazard({ life: 1e6, armed: 50 }) });
    expect(msgs(b.peer, 'use').map(m => [m.hazard.life, m.hazard.armed])).toEqual([[22, 2]]);
    for (const far of [{ x: 5001 }, { z: -5001 }, { y: 501 }, { vx: 201 }, { vx: 150, vz: 150 }]) {
      send(a.conn, { t: 'use', hazard: hazard({ id: 100006, ...far }) });
    }
    expect(msgs(b.peer, 'use')).toHaveLength(1);
    send(a.conn, { t: 'use', hazard: hazard({ id: 100006, x: -5000, y: 500, z: 5000, vx: 0, vy: 0, vz: 200 }) });
    expect(msgs(b.peer, 'use')).toHaveLength(2);
  });

  it('only relays item events while racing, and only from grid members', () => {
    const { a, b, d2 } = racers('countdown');
    send(a.conn, { t: 'pickup', orb: 1 });
    send(a.conn, { t: 'use', hazard: hazard() });
    expect(events(b.peer)).toHaveLength(0);
    now += START_LEAD_MS;
    server.tick();
    send(d2.conn, { t: 'pickup', orb: 1 });
    send(d2.conn, { t: 'use', hazard: hazard({ id: 400000, owner: 3 }) });
    expect(events(b.peer)).toHaveLength(0);
    send(a.conn, { t: 'pickup', orb: 1 });
    expect(events(b.peer)).toHaveLength(1);
  });

  it('counts valid item events as activity, but not dropped ones', () => {
    const { a, room } = racers();
    now += ROOM_IDLE_MS - 1;
    send(a.conn, { t: 'use', hazard: hazard({ id: 5 }) });
    now += 1;
    server.tick();
    expect(server.rooms.has(room.code)).toBe(false);

    const { a: a2, room: room2 } = racers();
    now += ROOM_IDLE_MS - 1;
    send(a2.conn, { t: 'pickup', orb: 0 });
    now += 1;
    server.tick();
    expect(server.rooms.has(room2.code)).toBe(true);
  });
});

describe('finish and results', () => {
  const config = trackById('ojuelegba');
  const track = buildTrack(config.control, 2, config.hills);
  const L = track.length;
  const LAPS = config.laps;
  const CUTOFF = FINISH_CUTOFF_MS / 1000;

  type Driver = { conn: number; slot: number; netId: number; speed: number; honest?: boolean; sent?: boolean };

  const carAt = (netId: number, distance: number): CarState => {
    const p = sampleAt(track, distance).pos;
    return { netId, x: p.x, y: p.y, z: p.z, qx: 0, qy: 0, qz: 0, qw: 1, vx: 0, vy: 0, vz: 0, distance, laps: 0, flags: 0 };
  };
  const lapsAt = (speed: number) => Array.from({ length: LAPS }, () => L / speed);
  const half = (t: number) => Math.ceil(t * 2) / 2;

  /**
   * Race time t (s) is server time startAt + t. Every driver sends two snapshots a second at a steady speed from the
   * line, and its finish once it crosses the line for the last time (a dishonest one claims a 1 s first lap).
   */
  function drive(startAt: number, drivers: Driver[], from: number, to: number) {
    for (let t = from; t <= to + 1e-9; t += 0.5) {
      now = startAt + t * 1000;
      for (const d of drivers) {
        const distance = d.speed * t;
        server.message(d.conn, encodeSnapshot({ slot: d.slot, raceSeq: 1, time: t, cars: [carAt(d.netId, distance)] }));
        if (!d.sent && distance >= LAPS * L) {
          d.sent = true;
          const laps = d.honest === false ? [1, ...lapsAt(d.speed).slice(1)] : lapsAt(d.speed);
          send(d.conn, { t: 'finish', netId: d.netId, laps, time: laps.reduce((x, y) => x + y, 0) });
        }
      }
      server.tick();
    }
  }

  it('broadcasts finished, then results 30 s after the first finish, then returns to lobby with ready reset', () => {
    const { a, b, c, d2, room } = racers();
    const startAt = msgs(a.peer, 'start')[0].at;
    const drivers: Driver[] = [
      { conn: a.conn, slot: 1, netId: 0, speed: 25 },
      { conn: b.conn, slot: 2, netId: 1, speed: 24 },
      { conn: c.conn, slot: 3, netId: 2, speed: 10 },
    ];
    const tA = half((LAPS * L) / 25);
    drive(startAt, drivers, 0, tA);
    for (const p of [a, b, c]) {
      const finished = msgs(p.peer, 'finished');
      expect(finished.map(m => m.netId)).toEqual([0]);
      expect(finished[0].time).toBeCloseTo((LAPS * L) / 25);
    }
    expect(msgs(d2.peer, 'finished')).toHaveLength(0);

    drive(startAt, drivers, tA + 0.5, tA + CUTOFF - 0.5);
    expect(msgs(a.peer, 'finished').map(m => m.netId)).toEqual([0, 1]);
    expect(msgs(a.peer, 'results')).toHaveLength(0);
    expect(room.phase).toBe('racing');

    drive(startAt, drivers, tA + CUTOFF, tA + CUTOFF);
    const [res] = msgs(a.peer, 'results');
    expect(res.raceSeq).toBe(1);
    expect(res.results.map(r => [r.netId, r.place, r.projected, r.dnf])).toEqual([[0, 1, false, false], [1, 2, false, false], [2, 3, true, false]]);
    expect(res.results[0].time).toBeCloseTo((LAPS * L) / 25);
    expect(res.results[1].best).toBeCloseTo(L / 24);
    // The slow car's projection from its average speed is its real pace.
    expect(res.results[2].time).toBeCloseTo((LAPS * L) / 10, 0);
    for (const p of [b, c]) expect(msgs(p.peer, 'results')).toEqual([res]);
    expect(msgs(d2.peer, 'results')).toHaveLength(0);

    expect(room.phase).toBe('lobby');
    for (const p of [a, b, c, d2]) {
      const view = lastRoom(p.peer);
      expect(view.phase).toBe('lobby');
      expect(view.players.every(pl => !pl.ready)).toBe(true);
    }

    // Snapshots and finishes after the race are dropped; a rematch gets a new raceSeq.
    const before = a.peer.sent.length;
    drive(startAt, drivers, tA + CUTOFF + 1, tA + CUTOFF + 1);
    send(c.conn, { t: 'finish', netId: 2, laps: lapsAt(10), time: (LAPS * L) / 10 });
    expect(a.peer.sent.length).toBe(before);
    for (const p of [a, b, c, d2]) send(p.conn, { t: 'lobby', ready: true });
    send(a.conn, { t: 'start' });
    expect(msgs(a.peer, 'grid').at(-1)!.raceSeq).toBe(2);
    expect(msgs(d2.peer, 'grid').at(-1)!.grid.map(g => g.slot)).toEqual([1, 2, 3, 4]);
  });

  it('sends results early when every car has finished or is DNF', () => {
    const { a, b, c, room } = racers();
    const startAt = msgs(a.peer, 'start')[0].at;
    const drivers: Driver[] = [
      { conn: a.conn, slot: 1, netId: 0, speed: 25 },
      { conn: b.conn, slot: 2, netId: 1, speed: 24 },
      { conn: c.conn, slot: 3, netId: 2, speed: 23, honest: false },
    ];
    drive(startAt, drivers, 0, half((LAPS * L) / 24));
    expect(msgs(a.peer, 'finished').map(m => m.netId)).toEqual([0, 1]);
    expect(msgs(a.peer, 'results')).toHaveLength(0);
    // c's finish claims a 1 s lap: it is refused, c is DNF, and nobody is left racing.
    drive(startAt, drivers, half((LAPS * L) / 24) + 0.5, half((LAPS * L) / 23));
    expect(msgs(a.peer, 'finished').map(m => m.netId)).toEqual([0, 1]);
    const [res] = msgs(a.peer, 'results');
    expect(res.results.map(r => [r.netId, r.dnf, r.time === null])).toEqual([[0, false, false], [1, false, false], [2, true, true]]);
    expect(room.phase).toBe('lobby');
  });

  it('lets the host finish AI cars, and the results include them', () => {
    const a = create();
    const b = join(a.welcome.code);
    send(a.conn, { t: 'lobby', fillAI: true });
    for (const p of [a, b]) send(p.conn, { t: 'lobby', ready: true });
    send(a.conn, { t: 'start' });
    for (const p of [a, b]) send(p.conn, { t: 'loaded' });
    now += START_LEAD_MS;
    server.tick();
    const startAt = msgs(a.peer, 'start')[0].at;
    // AI cars are netIds 0-3 on the host's connection, then the host (4) and the guest (5).
    const drivers: Driver[] = [0, 1, 2, 3, 4].map(netId => ({ conn: a.conn, slot: 1, netId, speed: 25 - netId }));
    drivers.push({ conn: b.conn, slot: 2, netId: 5, speed: 20 });
    drive(startAt, drivers, 0, half((LAPS * L) / 20));
    const [res] = msgs(b.peer, 'results');
    expect(res.results).toHaveLength(6);
    expect(res.results.map(r => r.netId)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(res.results.map(r => r.ai)).toEqual([true, true, true, true, false, false]);
    expect(res.results.every(r => !r.dnf && !r.projected)).toBe(true);
  });

  it('drops finish messages that are forged, malformed, repeated or outside the race', () => {
    const { a, b, room } = racers('countdown');
    const time = (LAPS * L) / 25;
    send(a.conn, { t: 'finish', netId: 0, laps: lapsAt(25), time });
    now += START_LEAD_MS;
    server.tick();
    expect(room.phase).toBe('racing');
    const startAt = msgs(a.peer, 'start')[0].at;
    drive(startAt, [{ conn: a.conn, slot: 1, netId: 0, speed: 25, sent: true }], 0, half(time));
    const activity = room.lastActivity;
    now += 1;
    for (const bad of [
      { t: 'finish', netId: 1, laps: lapsAt(25), time },
      { t: 'finish', netId: 0, laps: lapsAt(25).slice(1), time },
      { t: 'finish', netId: 0, laps: [...lapsAt(25), 1], time },
      { t: 'finish', netId: 0, laps: [-1, ...lapsAt(25).slice(1)], time },
      { t: 'finish', netId: 0, laps: ['8', ...lapsAt(25).slice(1)], time },
      { t: 'finish', netId: 0, laps: 'fast', time },
      { t: 'finish', netId: 0.5, laps: lapsAt(25), time },
      { t: 'finish', netId: 0, laps: lapsAt(25), time: 'x' },
    ]) send(a.conn, bad);
    server.message(a.conn, JSON.stringify({ t: 'finish', netId: 0, laps: lapsAt(25), time }).replace(/"time":[^,}]+/, '"time":1e999'));
    expect(msgs(b.peer, 'finished')).toHaveLength(0);
    expect(room.lastActivity).toBe(activity);

    send(a.conn, { t: 'finish', netId: 0, laps: lapsAt(25), time });
    expect(room.lastActivity).toBe(now);
    // Only an accepted finish counts as activity: a repeat does not.
    const accepted = now;
    now += 1;
    send(a.conn, { t: 'finish', netId: 0, laps: lapsAt(25), time });
    expect(room.lastActivity).toBe(accepted);
    expect(msgs(b.peer, 'finished')).toEqual([{ t: 'finished', netId: 0, time }]);
  });

  it('does not let a snapshot stamped in the future widen what the referee credits', () => {
    const { a, room } = racers();
    const startAt = msgs(a.peer, 'start')[0].at;
    drive(startAt, [{ conn: a.conn, slot: 1, netId: 0, speed: 25, sent: true }], 0, 20);
    server.message(a.conn, encodeSnapshot({ slot: 1, raceSeq: 1, time: 1e6, cars: [carAt(0, LAPS * L - 5)] }));
    // Clamped to the room's race time + 1 s: one second at full speed plus the step slack, not a whole race.
    expect(room['referee']!.distanceOf(0)).toBeCloseTo(25 * 20 + maxTopSpeed(vehicleById('okada')) * 1.6 + 10);
  });

  it('accepts a finish re-sent after a reconnect, claiming the time the car really crossed the line', () => {
    const { a, b } = racers();
    const startAt = msgs(a.peer, 'start')[0].at;
    const time = (LAPS * L) / 25;
    // The finish went out while the socket was down; the phone resumes 8 s later and sends it again.
    drive(startAt, [{ conn: a.conn, slot: 1, netId: 0, speed: 25, sent: true }], 0, half(time));
    now += 8000;
    send(a.conn, { t: 'finish', netId: 0, laps: lapsAt(25), time });
    expect(msgs(b.peer, 'finished')).toEqual([{ t: 'finished', netId: 0, time }]);
  });

  it('accepts an honest finish after a mobile-data stall delivers the last snapshots late', () => {
    const { a, b } = racers();
    const startAt = msgs(a.peer, 'start')[0].at;
    const time = (LAPS * L) / 25;
    const T = half(time);
    drive(startAt, [{ conn: a.conn, slot: 1, netId: 0, speed: 25, sent: true }], 0, T - 3);
    // The socket stalls: the last 3 s of snapshots all reach the server 3 s late, followed by the finish.
    now = startAt + (T + 3) * 1000;
    for (let t = T - 2.5; t <= T + 1e-9; t += 0.5) {
      server.message(a.conn, encodeSnapshot({ slot: 1, raceSeq: 1, time: t, cars: [carAt(0, 25 * t)] }));
    }
    send(a.conn, { t: 'finish', netId: 0, laps: lapsAt(25), time });
    expect(msgs(b.peer, 'finished')).toEqual([{ t: 'finished', netId: 0, time }]);
  });

  it('still reads a finish that follows a burst of 40 buffered snapshots in the same millisecond', () => {
    const { a, b } = racers();
    const startAt = msgs(a.peer, 'start')[0].at;
    const time = (LAPS * L) / 25;
    drive(startAt, [{ conn: a.conn, slot: 1, netId: 0, speed: 25, sent: true }], 0, half(time));
    const relayed = b.peer.sent.filter(d => typeof d !== 'string').length;
    for (let i = 0; i < 40; i++) {
      server.message(a.conn, encodeSnapshot({ slot: 1, raceSeq: 1, time: half(time), cars: [carAt(0, 25 * half(time))] }));
    }
    send(a.conn, { t: 'finish', netId: 0, laps: lapsAt(25), time });
    expect(msgs(b.peer, 'finished')).toEqual([{ t: 'finished', netId: 0, time }]);
    expect(b.peer.sent.filter(d => typeof d !== 'string').length - relayed).toBe(40);
  });

  it('accepts an honest finish after a 6 s stall delivers 90 snapshots at once', () => {
    const { a, b } = racers();
    const startAt = msgs(a.peer, 'start')[0].at;
    const time = (LAPS * L) / 25;
    const T = half(time);
    drive(startAt, [{ conn: a.conn, slot: 1, netId: 0, speed: 25, sent: true }], 0, T - 6);
    // 6 s of snapshots at 15 a second, all arriving in the same millisecond, then the finish.
    now = startAt + (T + 1) * 1000;
    for (let i = 1; i <= 90; i++) {
      const t = T - 6 + i / 15;
      server.message(a.conn, encodeSnapshot({ slot: 1, raceSeq: 1, time: t, cars: [carAt(0, 25 * t)] }));
    }
    send(a.conn, { t: 'finish', netId: 0, laps: lapsAt(25), time });
    expect(msgs(b.peer, 'finished')).toEqual([{ t: 'finished', netId: 0, time }]);
  });

  it('still limits a sustained flood of snapshots', () => {
    const { a, b } = racers();
    const startAt = msgs(a.peer, 'start')[0].at;
    const relayed = () => b.peer.sent.filter(d => typeof d !== 'string').length;
    const before = relayed();
    // 100 a second for 10 s: the burst allowance, then 30 a second.
    for (let ms = 0; ms < 10_000; ms += 10) {
      now = startAt + 1000 + ms;
      const t = 1 + ms / 1000;
      server.message(a.conn, encodeSnapshot({ slot: 1, raceSeq: 1, time: t, cars: [carAt(0, 5 * t)] }));
    }
    expect(relayed() - before).toBeLessThanOrEqual(150 + 30 * 10 + 1);
    expect(relayed() - before).toBeGreaterThanOrEqual(150 + 30 * 10 - 1);
  });

  it('refuses a finish claimed from the future', () => {
    const { a, b } = racers();
    const startAt = msgs(a.peer, 'start')[0].at;
    const time = (LAPS * L) / 25;
    drive(startAt, [{ conn: a.conn, slot: 1, netId: 0, speed: 25, sent: true }], 0, half(time));
    // Laps that add up to a time 1.5 s past the room's race time.
    const ahead = (now - startAt) / 1000 + 1.5;
    send(a.conn, { t: 'finish', netId: 0, laps: lapsAt(LAPS * L / ahead), time: ahead });
    expect(msgs(b.peer, 'finished')).toHaveLength(0);
  });

  it('a racer gone for 15 s is DNF and dnf is broadcast', () => {
    const { a, b, c, d2, room } = racers();
    const token = msgs(b.peer, 'welcome')[0].token;
    server.close(b.conn);
    now += RECONNECT_GRACE_MS - 1;
    server.tick();
    expect(msgs(a.peer, 'dnf')).toHaveLength(0);
    now += 1;
    server.tick();
    for (const p of [a, c]) expect(msgs(p.peer, 'dnf')).toEqual([{ t: 'dnf', netIds: [1] }]);
    // Only the racers hear it, and only once.
    expect(msgs(d2.peer, 'dnf')).toHaveLength(0);
    server.tick();
    expect(msgs(a.peer, 'dnf')).toHaveLength(1);
    // Too late to come back to this race.
    const late = connect();
    send(late.conn, { t: 'resume', token });
    expect(msgs(late.peer, 'error')[0].error).toBe('expired');
    expect(room['referee']!.results(1).find(r => r.netId === 1)!.dnf).toBe(true);
  });

  it('leave during a race DNFs at once', () => {
    const { a, b, c } = racers();
    send(b.conn, { t: 'leave' });
    for (const p of [a, c]) expect(msgs(p.peer, 'dnf')).toEqual([{ t: 'dnf', netIds: [1] }]);
  });

  it('a player resuming during a race they are not in gets the room in racing phase', () => {
    const { d2 } = racers();
    expect(msgs(d2.peer, 'welcome')).toHaveLength(1);
    expect(lastRoom(d2.peer).phase).toBe('racing');
    expect(msgs(d2.peer, 'grid')).toHaveLength(0);
    expect(msgs(d2.peer, 'start')).toHaveLength(0);
  });

  it('tells a racer who resumes about the cars that dropped out while they were away', () => {
    const { a, b, c } = racers();
    server.close(b.conn);
    send(c.conn, { t: 'leave' });
    const b2 = connect();
    send(b2.conn, { t: 'resume', token: msgs(b.peer, 'welcome')[0].token });
    expect(msgs(b2.peer, 'dnf')).toEqual([{ t: 'dnf', netIds: [2] }]);
    expect(msgs(a.peer, 'dnf')).toEqual([{ t: 'dnf', netIds: [2] }]);
  });

  it('expired members are removed when the room returns to the lobby', () => {
    const { a, b, c, d2, room } = racers();
    const startAt = msgs(a.peer, 'start')[0].at;
    server.close(b.conn);
    now += RECONNECT_GRACE_MS;
    server.tick();
    // Kept (as gone) for the rest of the race.
    expect(lastRoom(a.peer).players.map(p => [p.slot, p.connected])).toEqual([[1, true], [2, false], [3, true], [4, true]]);
    const drivers: Driver[] = [
      { conn: a.conn, slot: 1, netId: 0, speed: 25 },
      { conn: c.conn, slot: 3, netId: 2, speed: 24 },
    ];
    drive(startAt, drivers, (now - startAt) / 1000, half((LAPS * L) / 24));
    const [res] = msgs(a.peer, 'results');
    expect(res.results.map(r => [r.netId, r.dnf])).toEqual([[0, false], [2, false], [1, true]]);
    expect(room.phase).toBe('lobby');
    for (const p of [a, c, d2]) expect(lastRoom(p.peer).players.map(pl => pl.slot)).toEqual([1, 3, 4]);
  });

  it('refuses (DNF) a finish claimed well before the car was last seen short of the line, and does not count it as activity', () => {
    const { a, b, room } = racers();
    const startAt = msgs(a.peer, 'start')[0].at;
    const time = (LAPS * L) / 25;
    drive(startAt, [{ conn: a.conn, slot: 1, netId: 0, speed: 25, sent: true }], 0, half(time));
    // Laps that add up and are each possible, but finished 4.5 s before the room says the car got there.
    const laps = lapsAt(25).map(t => t - 1.5);
    const activity = room.lastActivity;
    now += 1;
    send(a.conn, { t: 'finish', netId: 0, laps, time: laps.reduce((x, y) => x + y, 0) });
    expect(msgs(b.peer, 'finished')).toHaveLength(0);
    expect(room.lastActivity).toBe(activity);
    // Everyone on the grid, the claimer too, hears that the car is out.
    for (const p of [a, b]) expect(msgs(p.peer, 'dnf')).toEqual([{ t: 'dnf', netIds: [0] }]);
    // Refused means DNF: an honest retry is no good now, and is not announced again.
    send(a.conn, { t: 'finish', netId: 0, laps: lapsAt(25), time });
    expect(msgs(b.peer, 'finished')).toHaveLength(0);
    expect(msgs(b.peer, 'dnf')).toHaveLength(1);
  });

  it('keeps the race going while the only racer left has a short blip', () => {
    const { a, b, c, room } = racers();
    send(b.conn, { t: 'leave' });
    send(c.conn, { t: 'leave' });
    server.close(a.conn);
    now += 1000;
    server.tick();
    expect(room.phase).toBe('racing');
    const a2 = connect();
    send(a2.conn, { t: 'resume', token: a.welcome.token });
    expect(msgs(a2.peer, 'grid')).toHaveLength(1);
    expect(msgs(a2.peer, 'start')).toHaveLength(1);
    expect(lastRoom(a2.peer).phase).toBe('racing');
  });

  it('re-sends the results to a racer who missed them and resumes in the lobby', () => {
    const { a, b, c, d2, room } = racers();
    const startAt = msgs(a.peer, 'start')[0].at;
    const fast: Driver = { conn: b.conn, slot: 2, netId: 1, speed: 25 };
    const rest: Driver[] = [
      { conn: a.conn, slot: 1, netId: 0, speed: 24.8 },
      { conn: c.conn, slot: 3, netId: 2, speed: 24.6 },
    ];
    const tB = half((LAPS * L) / 25);
    drive(startAt, [fast, ...rest], 0, tB);
    expect(msgs(a.peer, 'finished').map(m => m.netId)).toEqual([1]);
    // b's phone drops just after its finish, and the race ends while it is away.
    server.close(b.conn);
    drive(startAt, rest, tB + 0.5, half((LAPS * L) / 24.6));
    const [res] = msgs(a.peer, 'results');
    expect(res).toBeDefined();
    expect(msgs(b.peer, 'results')).toHaveLength(0);
    expect(room.phase).toBe('lobby');

    const b2 = connect();
    send(b2.conn, { t: 'resume', token: msgs(b.peer, 'welcome')[0].token });
    const kinds = b2.peer.sent.map(d => (JSON.parse(d as string) as ServerMessage).t);
    expect(kinds).toEqual(['welcome', 'room', 'results']);
    expect(msgs(b2.peer, 'results')).toEqual([res]);

    // A member who was not on that grid gets no results, and a new race forgets them.
    const late = join(a.welcome.code, 'Efe');
    const lateToken = msgs(late.peer, 'welcome')[0].token;
    server.close(late.conn);
    const late2 = connect();
    send(late2.conn, { t: 'resume', token: lateToken });
    expect(msgs(late2.peer, 'results')).toHaveLength(0);
    for (const p of [a, b2, c, d2, late2]) send(p.conn, { t: 'lobby', ready: true });
    send(a.conn, { t: 'start' });
    expect(room.phase).toBe('loading');
    expect(room['resultsMsg']).toBeNull();
  });

  it('ends a race nobody is left in: no results, back to the lobby', () => {
    for (const phase of ['loading', 'racing'] as const) {
      const a = create();
      const b = join(a.welcome.code);
      const c = join(a.welcome.code, 'Chidi');
      for (const p of [a, b, c]) send(p.conn, { t: 'lobby', ready: true });
      server.close(c.conn);
      send(a.conn, { t: 'start' });
      const room = server.rooms.get(a.welcome.code)!;
      if (phase === 'racing') {
        for (const p of [a, b]) send(p.conn, { t: 'loaded' });
        now += START_LEAD_MS;
        server.tick();
      }
      expect(room.phase).toBe(phase);
      // c is not on the grid and comes back to watch; both racers drop or leave.
      const c2 = connect();
      send(c2.conn, { t: 'resume', token: msgs(c.peer, 'welcome')[0].token });
      server.close(a.conn);
      send(b.conn, { t: 'leave' });
      server.tick();
      // a may still come back within the grace period, so the race waits for them.
      expect(room.phase).not.toBe('lobby');
      now += RECONNECT_GRACE_MS;
      server.tick();
      expect(room.phase).toBe('lobby');
      expect(lastRoom(c2.peer).phase).toBe('lobby');
      for (const p of [a, b, c2]) expect(msgs(p.peer, 'results')).toHaveLength(0);
      // Once everyone is gone the room is reaped as usual.
      send(c2.conn, { t: 'leave' });
      now += RECONNECT_GRACE_MS;
      server.tick();
      expect(server.rooms.has(room.code)).toBe(false);
    }
  });
});

describe('quick room', () => {
  type Sent = { conn: number; msg: ServerMessage };
  let sent: Sent[];
  let room: Room;

  const seeded = (s: number) => () => (s = (s * 16807) % 2147483647) / 2147483647;
  function quickRoom(seed = 7, quick = true) {
    sent = [];
    room = new Room('QUIK', TRACKS[0].id, (conn, msg) => sent.push({ conn, msg }), now, { quick, random: seeded(seed), clock: () => now });
    return room;
  }
  beforeEach(() => quickRoom());

  /** Seats a human on connection `conn` in the lowest free slot. */
  const human = (conn: number, name = `P${conn}`) => room.add(conn, name, 'okada', 'red', `token-${conn}`);
  const sentTo = <T extends ServerMessage['t']>(conn: number, t: T) =>
    sent.filter(s => s.conn === conn && s.msg.t === t).map(s => s.msg as Extract<ServerMessage, { t: T }>);

  it('timer starts at the first human and a later join does not reset it', () => {
    expect(room.view().quick!.startsInMs).toBe(QUICK_WAIT_MS);
    now += 5000;
    expect(room.view().quick!.startsInMs).toBe(QUICK_WAIT_MS);
    human(1);
    expect(room.view().quick!.startsInMs).toBe(QUICK_WAIT_MS);
    now += 10_000;
    human(2);
    expect(room.view().quick!.startsInMs).toBe(QUICK_WAIT_MS - 10_000);
    now += QUICK_WAIT_MS - 10_000 - 1;
    room.tick(now);
    expect(room.phase).toBe('lobby');
    now += 1;
    room.tick(now);
    expect(room.phase).toBe('loading');
  });

  it('race starts at 30s with one human and five bots in the grid', () => {
    human(1, 'Ade');
    now += QUICK_WAIT_MS;
    room.tick(now);
    expect(room.phase).toBe('loading');
    expect(room.raceSeq).toBe(1);
    const [g] = sentTo(1, 'grid');
    expect(g.grid.map(e => e.netId)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(g.grid.map(e => e.ai)).toEqual([true, true, true, true, true, false]);
    expect(g.grid.every(e => e.slot === 1)).toBe(true);
    expect(g.grid[5]).toMatchObject({ slot: 1, name: 'Ade', vehicle: 'okada', paint: 'red' });
    const names = g.grid.map(e => e.name);
    expect(new Set(names).size).toBe(6);
    expect(g.grid.slice(0, 5).every(e => BOT_NAMES.includes(e.name))).toBe(true);
    // The view keeps its quick block once the race is on, with nothing left to wait for.
    expect(room.view().quick!.startsInMs).toBe(0);
    // It starts only once.
    now += 1000;
    room.tick(now);
    expect(sentTo(1, 'grid')).toHaveLength(1);
  });

  it('sixth human starts it at once with no bots', () => {
    for (let c = 1; c <= 6; c++) human(c);
    expect(room.size).toBe(6);
    expect(room.isFull).toBe(true);
    room.tick(now);
    expect(room.phase).toBe('loading');
    const [g] = sentTo(3, 'grid');
    expect(g.grid.map(e => [e.slot, e.ai])).toEqual([1, 2, 3, 4, 5, 6].map(s => [s, false]));
  });

  it('six members with one disconnected does not start early', () => {
    for (let c = 1; c <= 6; c++) human(c);
    room.detach(4, now);
    room.tick(now);
    expect(room.phase).toBe('lobby');
    // Back again: six connected humans start it.
    room.attach(4, 4);
    room.tick(now);
    expect(room.phase).toBe('loading');
  });

  it('a repeated vote for the same track reports no change', () => {
    human(1);
    expect(room.vote(1, 'ikorodu')).toBe(true);
    expect(room.vote(1, 'ikorodu')).toBe(false);
    expect(room.vote(1, 'ojuelegba')).toBe(true);
  });

  it('most votes wins', () => {
    for (let c = 1; c <= 3; c++) human(c);
    expect(room.vote(1, 'third-mainland')).toBe(true);
    expect(room.vote(2, 'third-mainland')).toBe(true);
    // A later vote replaces the earlier one.
    expect(room.vote(2, 'ikorodu')).toBe(true);
    expect(room.vote(3, 'ikorodu')).toBe(true);
    expect(room.view().quick!.votes).toEqual({ ojuelegba: 0, 'third-mainland': 1, ikorodu: 2 });
    now += QUICK_WAIT_MS;
    room.tick(now);
    expect(room.trackId).toBe('ikorodu');
    expect(sentTo(1, 'grid')[0]).toMatchObject({ trackId: 'ikorodu', laps: trackById('ikorodu').laps });
  });

  it('tie and no votes pick from the right set', () => {
    const tied = new Set<string>();
    const open = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      quickRoom(seed);
      human(1);
      human(2);
      human(3);
      room.vote(1, 'third-mainland');
      room.vote(2, 'ikorodu');
      now += QUICK_WAIT_MS;
      room.tick(now);
      tied.add(room.trackId);

      quickRoom(seed * 7919);
      human(1);
      now += QUICK_WAIT_MS;
      room.tick(now);
      open.add(room.trackId);
    }
    expect([...tied].sort()).toEqual(['ikorodu', 'third-mainland']);
    expect([...open].sort()).toEqual(TRACKS.map(t => t.id).sort());
  });

  it('unknown track vote refused', () => {
    human(1);
    expect(room.vote(1, 'atlantis')).toBe(false);
    expect(room.vote(9, 'ikorodu')).toBe(false);
    expect(Object.values(room.view().quick!.votes).every(n => n === 0)).toBe(true);
  });

  it('vote ignored outside a quick lobby', () => {
    quickRoom(7, false);
    human(1);
    expect(room.vote(1, 'ikorodu')).toBe(false);
    expect(room.view().quick).toBeUndefined();

    quickRoom();
    human(1);
    now += QUICK_WAIT_MS;
    room.tick(now);
    expect(room.phase).toBe('loading');
    expect(room.vote(1, 'ikorodu')).toBe(false);
  });

  it('quick room does not start with no connected human', () => {
    human(1);
    room.detach(1, now);
    now += QUICK_WAIT_MS + 5000;
    room.tick(now);
    expect(room.phase).toBe('lobby');
    expect(sent).toHaveLength(0);
    room.attach(1, 5);
    room.tick(now);
    expect(room.phase).toBe('loading');
    expect(sentTo(5, 'grid')).toHaveLength(1);
  });

  it('start and fillAI refused with not-host', () => {
    human(1);
    human(2);
    expect(room.view().hostSlot).toBe(0);
    expect(room.lobby(1, { fillAI: true })).toBe('not-host');
    expect(room.startRace(1, now, Math.random)).toBe('not-host');
    expect(room.phase).toBe('lobby');
    // Ready is ignored: every connected human counts as ready.
    expect(room.lobby(2, { ready: false, vehicle: 'danfo' })).toBeNull();
    expect(room.view().players.slice(0, 2).map(p => [p.slot, p.vehicle, p.ready])).toEqual([[1, 'okada', true], [2, 'danfo', true]]);
    room.remove(1);
    expect(room.view().hostSlot).toBe(0);
  });

  describe('hidden bot flag', () => {
    const start = () => {
      human(1, 'Ade');
      human(2, 'Bola');
      now += QUICK_WAIT_MS;
      room.tick(now);
    };
    const flags = (conn: number) => sentTo(conn, 'grid')[0].grid.map(e => [e.netId, e.ai]);

    it('owner sees ai true for bots only, others see all false', () => {
      start();
      const real = (room as any).grid as { netId: number; ai: boolean; slot: number }[];
      const bots = real.filter(e => e.ai);
      expect(bots.length).toBe(4);
      expect(flags(1).filter(([, ai]) => ai).map(([id]) => id)).toEqual(bots.map(e => e.netId));
      expect(flags(2).every(([, ai]) => ai === false)).toBe(true);
    });

    it('human cars are false for everyone', () => {
      start();
      const humans = (room as any).grid.filter((e: { ai: boolean }) => !e.ai).map((e: { netId: number }) => e.netId);
      for (const conn of [1, 2]) for (const [id, ai] of flags(conn)) if (humans.includes(id)) expect(ai).toBe(false);
    });

    it('results are filtered the same way', () => {
      start();
      (room as any).endRace(now + 5000, true);
      const r1 = sentTo(1, 'results')[0].results;
      const r2 = sentTo(2, 'results')[0].results;
      expect(r1.filter(r => r.ai)).toHaveLength(4);
      expect(r1.filter(r => r.ai).every(r => r.slot === 1)).toBe(true);
      expect(r2.every(r => !r.ai)).toBe(true);
      expect(r1).toHaveLength(6);
    });

    it('resume re-sends a filtered grid', () => {
      start();
      room.detach(2, now);
      room.attach(2, 9);
      room.resync(2);
      expect(sentTo(9, 'grid')[0].grid.every(e => !e.ai)).toBe(true);
      room.detach(1, now);
      room.attach(1, 8);
      room.resync(1);
      expect(sentTo(8, 'grid')[0].grid.filter(e => e.ai)).toHaveLength(4);
    });

    it('referee still treats bots as ai', () => {
      start();
      const results = (room as any).referee.results(1) as { ai: boolean }[];
      expect(results.filter(r => r.ai)).toHaveLength(4);
      expect(((room as any).grid as { ai: boolean }[]).filter(e => e.ai)).toHaveLength(4);
    });

    it('friends room grid still carries real ai flags', () => {
      quickRoom(7, false);
      human(1, 'Ade');
      human(2, 'Bola');
      room.lobby(1, { ready: true });
      room.lobby(2, { ready: true });
      room.lobby(1, { fillAI: true });
      expect(room.startRace(1, now, Math.random)).toBeNull();
      const real = (room as any).grid as { ai: boolean }[];
      expect(real.some(e => e.ai)).toBe(true);
      expect(sentTo(2, 'grid')[0].grid.map(e => e.ai)).toEqual(real.map(e => e.ai));
    });
  });

  describe('bot handover', () => {
    type Entry = { netId: number; ai: boolean; slot: number };
    const real = () => (room as any).grid as Entry[];
    const botIds = () => real().filter(e => e.ai).map(e => e.netId);
    const carOf = (slot: number) => real().find(e => !e.ai && e.slot === slot)!.netId;
    const car = (netId: number): CarState => ({
      netId, x: 1, y: 0.5, z: -3, qx: 0, qy: 0, qz: 0, qw: 1, vx: 0, vy: 0, vz: 12, distance: 40, laps: 0, flags: 0,
    });
    /** Humans on conns 1..n (slot = conn), started and taken to `phase`. */
    function race(n: number, phase: 'loading' | 'countdown' | 'racing' = 'racing') {
      for (let c = 1; c <= n; c++) human(c);
      now += QUICK_WAIT_MS;
      room.tick(now);
      if (phase === 'loading') return;
      for (let s = 1; s <= n; s++) room.markLoaded(s, now);
      expect(room.phase).toBe('countdown');
      if (phase === 'countdown') return;
      now += START_LEAD_MS;
      room.tick(now);
      expect(room.phase).toBe('racing');
    }

    it('owner leaving mid-race hands bots to the next human and sends adopt', () => {
      race(3);
      const bots = botIds();
      expect(bots).toHaveLength(3);
      expect(real().filter(e => e.ai).every(e => e.slot === 1)).toBe(true);
      room.remove(1);
      expect(real().filter(e => e.ai).every(e => e.slot === 2)).toBe(true);
      expect(sentTo(2, 'adopt')).toEqual([{ t: 'adopt', netIds: bots }]);
      expect(sentTo(3, 'adopt')).toHaveLength(0);
      // Mid-race the grid was already sent; only the adopt goes out.
      expect(sentTo(2, 'grid')).toHaveLength(1);
    });

    it("leaver's own car is DNF but bots are not", () => {
      race(3);
      room.remove(1);
      for (const conn of [2, 3]) expect(sentTo(conn, 'dnf')).toEqual([{ t: 'dnf', netIds: [carOf(1)] }]);
      const referee = (room as any).referee;
      expect(referee.running(carOf(1))).toBe(false);
      for (const id of botIds()) expect(referee.running(id)).toBe(true);
      expect([...(room as any).dropped]).toEqual([carOf(1)]);
    });

    it('snapshots for adopted cars are accepted from the new owner and refused from the old', () => {
      race(3);
      const [bot] = botIds();
      const snap = (slot: number, cars: CarState[]): Snapshot => ({ slot, raceSeq: 1, time: 1, cars });
      expect(room.snapshotTargets(snap(1, [car(bot)]))).not.toBeNull();
      expect(room.snapshotTargets(snap(2, [car(bot)]))).toBeNull();
      room.detach(1, now);
      now += RECONNECT_GRACE_MS;
      room.expire(now);
      expect(room.snapshotTargets(snap(2, [car(bot)]))).toEqual([3]);
      expect(room.snapshotTargets(snap(2, [car(carOf(2)), car(bot)]))).toEqual([3]);
      expect(room.snapshotTargets(snap(1, [car(bot)]))).toBeNull();
      // Finishes follow ownership the same way.
      const laps = Array(trackById(room.trackId).laps).fill(60);
      expect(room.finish(1, bot, laps, 200, now)).toBe(false);
      expect((room as any).referee.running(bot)).toBe(true);
    });

    it('grace expiry also hands over', () => {
      race(2);
      room.detach(1, now);
      now += RECONNECT_GRACE_MS - 1;
      room.expire(now);
      room.tick(now);
      expect(sentTo(2, 'adopt')).toHaveLength(0);
      expect(real().filter(e => e.ai).every(e => e.slot === 1)).toBe(true);
      now += 1;
      room.expire(now);
      room.tick(now);
      expect(sentTo(2, 'adopt')).toEqual([{ t: 'adopt', netIds: botIds() }]);
      expect(real().filter(e => e.ai).every(e => e.slot === 2)).toBe(true);
      expect(sentTo(2, 'dnf')).toEqual([{ t: 'dnf', netIds: [carOf(1)] }]);
      expect(room.phase).toBe('racing');
    });

    it('owner grace expiring while the others are all away hands the bots to one still in grace', () => {
      race(3);
      const bots = botIds();
      room.detach(1, now);
      now += 1000;
      room.detach(2, now);
      room.detach(3, now);
      now += RECONNECT_GRACE_MS - 1000;
      // Owner's grace is over; 2 and 3 are still within theirs.
      room.expire(now);
      room.tick(now);
      expect(real().filter(e => e.ai).every(e => e.slot === 2)).toBe(true);
      const referee = (room as any).referee;
      for (const id of bots) expect(referee.running(id)).toBe(true);
      expect([...(room as any).dropped]).toEqual([carOf(1)]);
      // Nobody connected to tell yet.
      expect(sent.some(s => s.msg.t === 'adopt')).toBe(false);
      expect(room.phase).toBe('racing');
      // The heir comes back and is told to drive them.
      room.attach(2, 12);
      room.resync(2);
      expect(sentTo(12, 'adopt')).toEqual([{ t: 'adopt', netIds: bots }]);
      expect(sentTo(12, 'grid')[0].grid.filter(e => e.ai).map(e => e.netId)).toEqual(bots);
    });

    it('handover during loading and countdown', () => {
      for (const phase of ['loading', 'countdown'] as const) {
        quickRoom();
        race(2, phase);
        const bots = botIds();
        room.remove(1);
        expect(room.phase).toBe(phase);
        const grids = sentTo(2, 'grid');
        expect(grids).toHaveLength(2);
        expect(grids[1].grid.filter(e => e.ai).map(e => e.netId)).toEqual(bots);
        expect(grids[1].grid.filter(e => e.ai).every(e => e.slot === 2)).toBe(true);
        expect(sentTo(2, 'adopt')).toEqual([{ t: 'adopt', netIds: bots }]);
      }
      // A handover in loading does not hold up the start.
      quickRoom();
      race(2, 'loading');
      room.markLoaded(2, now);
      room.remove(1);
      room.tick(now);
      expect(room.phase).toBe('countdown');
    });

    it('no human left ends the race', () => {
      race(1);
      room.remove(1);
      room.tick(now);
      expect(room.phase).toBe('lobby');
      expect(sent.some(s => s.msg.t === 'results')).toBe(false);

      // The bots changed hands first, then their new owner left too.
      quickRoom();
      race(2);
      room.remove(1);
      expect(sentTo(2, 'adopt')).toHaveLength(1);
      room.tick(now);
      expect(room.phase).toBe('racing');
      room.detach(2, now);
      now += RECONNECT_GRACE_MS;
      room.expire(now);
      room.tick(now);
      expect(room.phase).toBe('lobby');
      expect(sent.some(s => s.msg.t === 'results')).toBe(false);
    });

    it('resume after handover gets a grid with the current owner and the adopt', () => {
      race(3);
      // The first owner resuming before any handover gets no adopt: its grid already says which cars it drives.
      room.detach(1, now);
      room.attach(1, 7);
      room.resync(1);
      expect(sentTo(7, 'adopt')).toHaveLength(0);
      room.remove(1);
      room.detach(2, now);
      room.attach(2, 9);
      room.resync(2);
      const [g] = sentTo(9, 'grid');
      expect(g.grid.filter(e => e.ai).map(e => e.netId)).toEqual(botIds());
      expect(g.grid.filter(e => e.ai).every(e => e.slot === 2)).toBe(true);
      expect(sentTo(9, 'adopt')).toEqual([{ t: 'adopt', netIds: botIds() }]);
      room.detach(3, now);
      room.attach(3, 10);
      room.resync(3);
      expect(sentTo(10, 'grid')[0].grid.every(e => !e.ai)).toBe(true);
      expect(sentTo(10, 'adopt')).toHaveLength(0);
    });

    it("friends rooms still DNF the host's AI", () => {
      quickRoom(7, false);
      human(1);
      human(2);
      room.lobby(1, { ready: true });
      room.lobby(2, { ready: true });
      room.lobby(1, { fillAI: true });
      expect(room.startRace(1, now, Math.random)).toBeNull();
      room.markLoaded(1, now);
      room.markLoaded(2, now);
      now += START_LEAD_MS;
      room.tick(now);
      expect(room.phase).toBe('racing');
      const hostCars = real().filter(e => e.slot === 1).map(e => e.netId);
      expect(real().filter(e => e.ai).every(e => e.slot === 1)).toBe(true);
      room.remove(1);
      expect(sentTo(2, 'dnf')).toEqual([{ t: 'dnf', netIds: hostCars }]);
      expect(sent.some(s => s.msg.t === 'adopt')).toBe(false);
      expect(real().filter(e => e.ai).every(e => e.slot === 1)).toBe(true);
    });
  });

  it('view shows bots only after their appearance time and hides one when a human takes the seat', () => {
    human(1, 'Ade');
    const start = now;
    now = start + 2999;
    room.tick(now);
    expect(room.view().players.map(p => p.slot)).toEqual([1]);
    expect(sentTo(1, 'room')).toHaveLength(0);

    // Each second, a room broadcast goes out only when the number of bots shown has changed.
    let shown = 0;
    for (let t = 3000; t <= 26_000; t += 1000) {
      now = start + t;
      const before = sentTo(1, 'room').length;
      room.tick(now);
      const bots = room.view().players.length - 1;
      expect(sentTo(1, 'room').length - before).toBe(bots === shown ? 0 : 1);
      if (bots !== shown) expect(sentTo(1, 'room').at(-1)!.room.players).toHaveLength(bots + 1);
      expect(bots).toBeGreaterThanOrEqual(shown);
      shown = bots;
    }
    expect(room.phase).toBe('lobby');
    const players = room.view().players;
    expect(players).toHaveLength(6);
    expect(players[0]).toMatchObject({ slot: 1, name: 'Ade' });
    for (const bot of players.slice(1)) {
      expect(bot.slot).toBeGreaterThanOrEqual(BOT_SLOT_BASE);
      expect(bot).toMatchObject({ ready: true, connected: true });
      expect(bot.name).not.toBe('Ade');
    }
    // Bots are not members.
    expect(room.size).toBe(1);

    human(2, 'Bola');
    const after = room.view().players;
    expect(after).toHaveLength(6);
    expect(after.filter(p => p.slot < BOT_SLOT_BASE).map(p => p.slot)).toEqual([1, 2]);
    expect(after.filter(p => p.slot >= BOT_SLOT_BASE)).toHaveLength(4);
  });
});

describe('quick matchmaking', () => {
  function quick(name = 'Ade') {
    const c = connect();
    send(c.conn, { t: 'quick', name, vehicle: 'okada' });
    return { ...c, welcome: msgs(c.peer, 'welcome')[0] };
  }
  const codes = () => [...server.rooms.keys()];

  it('quick creates a room for the first caller and joins the second to it', () => {
    const a = quick('Ade');
    const b = quick('Bola');
    expect(server.rooms.size).toBe(1);
    expect(b.welcome.code).toBe(a.welcome.code);
    expect(b.welcome.slot).toBe(2);
    const room = lastRoom(a.peer);
    expect(room.quick).toBeDefined();
    expect(room.players.filter(p => p.connected).length).toBeGreaterThanOrEqual(2);
  });

  it('quick skips a full room and a started room', () => {
    const first = quick('P1');
    for (let i = 2; i <= 6; i++) quick('P' + i);
    // Six humans start the race on the next tick; until then the room is full.
    const seventh = quick('P7');
    expect(seventh.welcome.code).not.toBe(first.welcome.code);
    expect(server.rooms.size).toBe(2);
    server.tick();
    expect(server.rooms.get(first.welcome.code)!.phase).toBe('loading');
    const eighth = quick('P8');
    expect(eighth.welcome.code).toBe(seventh.welcome.code);
  });

  it('quick picks the room with least time left', () => {
    const a = quick('A');
    const full = [quick('x2'), quick('x3'), quick('x4'), quick('x5'), quick('x6')];
    expect(full).toHaveLength(5);
    // A is full now; b opens a second room later, c a third later still.
    now += 10_000;
    const b = quick('B');
    expect(b.welcome.code).not.toBe(a.welcome.code);
    server.rooms.get(a.welcome.code)!.remove(6);
    server.rooms.get(a.welcome.code)!.remove(5);
    now += 5_000;
    const c = connect();
    // Room A has 15 s left, room B has 25 s left: A wins.
    send(c.conn, { t: 'quick', name: 'C', vehicle: 'okada' });
    expect(msgs(c.peer, 'welcome')[0].code).toBe(a.welcome.code);
  });

  it('busy at 50 quick rooms', () => {
    for (let i = 0; i < 50; i++) {
      // Fill each room so the next caller must open another.
      const first = quick('F' + i);
      const room = server.rooms.get(first.welcome.code)!;
      for (let s = 2; s <= 6; s++) room.add(-1, 'x', 'okada', '', 't');
    }
    expect(server.rooms.size).toBe(50);
    const late = connect();
    send(late.conn, { t: 'quick', name: 'Late', vehicle: 'okada' });
    expect(msgs(late.peer, 'error')).toEqual([{ t: 'error', error: 'busy' }]);
    expect(msgs(late.peer, 'welcome')).toHaveLength(0);
    expect(server.rooms.size).toBe(50);
  });

  it('a joiner after loading begins lands in a new room', () => {
    const a = quick('A');
    now += QUICK_WAIT_MS;
    server.tick();
    expect(server.rooms.get(a.welcome.code)!.phase).toBe('loading');
    const b = quick('B');
    expect(b.welcome.code).not.toBe(a.welcome.code);
    expect(server.rooms.size).toBe(2);
  });

  it('a quick room that has raced and returned to the lobby is not offered again', () => {
    const a = quick('A');
    const room = server.rooms.get(a.welcome.code)!;
    room.phase = 'lobby';
    room.raceSeq = 1;
    const b = quick('B');
    expect(b.welcome.code).not.toBe(a.welcome.code);
  });

  it('an abandoned quick room is skipped and a new room opened', () => {
    const a = quick('A');
    server.close(a.conn);
    const room = server.rooms.get(a.welcome.code)!;
    // A is still a member, inside the lobby grace, but nobody is connected.
    expect(room.size).toBe(1);
    const b = quick('B');
    expect(b.welcome.code).not.toBe(a.welcome.code);
    expect(server.rooms.size).toBe(2);
  });

  it('a quick room whose wait has run out is skipped', () => {
    const a = quick('A');
    const room = server.rooms.get(a.welcome.code)!;
    // The wait is over but the room has not ticked yet.
    now += QUICK_WAIT_MS;
    expect(room.phase).toBe('lobby');
    expect(room.view().quick!.startsInMs).toBe(0);
    const b = quick('B');
    expect(b.welcome.code).not.toBe(a.welcome.code);
  });

  it('quick rooms that have raced do not count toward the room limit', () => {
    for (let i = 0; i < 50; i++) {
      const first = quick('F' + i);
      const room = server.rooms.get(first.welcome.code)!;
      if (i === 0) {
        // Raced once and back in the lobby: it only lingers until its members leave.
        room.phase = 'lobby';
        room.raceSeq = 1;
      } else for (let s = 2; s <= 6; s++) room.add(-1, 'x', 'okada', '', 't');
    }
    expect(server.rooms.size).toBe(50);
    const late = quick('Late');
    expect(msgs(late.peer, 'error')).toHaveLength(0);
    expect(late.welcome).toBeDefined();
    expect(server.rooms.size).toBe(51);
  });

  it('re-voting the same track does not broadcast', () => {
    const a = quick('A');
    const b = quick('B');
    send(a.conn, { t: 'vote', trackId: 'ikorodu' });
    const before = msgs(b.peer, 'room').length;
    send(a.conn, { t: 'vote', trackId: 'ikorodu' });
    expect(msgs(b.peer, 'room')).toHaveLength(before);
    send(a.conn, { t: 'vote', trackId: 'ojuelegba' });
    expect(msgs(b.peer, 'room')).toHaveLength(before + 1);
  });

  it('bad nickname gives bad-name', () => {
    const c = connect();
    send(c.conn, { t: 'quick', name: '   ', vehicle: 'okada' });
    expect(msgs(c.peer, 'error')).toEqual([{ t: 'error', error: 'bad-name' }]);
    expect(server.rooms.size).toBe(0);
  });

  it('vote message updates the tally for everyone', () => {
    const a = quick('A');
    const b = quick('B');
    send(a.conn, { t: 'vote', trackId: 'ikorodu' });
    for (const p of [a.peer, b.peer]) expect(lastRoom(p).quick!.votes.ikorodu).toBe(1);
    send(b.conn, { t: 'vote', trackId: 'nowhere' });
    expect(lastRoom(b.peer).quick!.votes.ikorodu).toBe(1);
    send(b.conn, { t: 'vote', trackId: 'x'.repeat(41) });
    expect(lastRoom(b.peer).quick!.votes.ikorodu).toBe(1);
  });

  it('a friends join by code into a quick room is refused as not-found', () => {
    const a = quick('A');
    const c = connect();
    send(c.conn, { t: 'join', code: a.welcome.code, name: 'Bola', vehicle: 'keke' });
    expect(msgs(c.peer, 'error').at(-1)?.error).toBe('not-found');
    expect(msgs(c.peer, 'welcome')).toHaveLength(0);
  });

  it('friends rooms never receive quick joiners', () => {
    const f = create('Host');
    const q = quick('Q');
    expect(q.welcome.code).not.toBe(f.welcome.code);
    expect(server.rooms.size).toBe(2);
    expect(codes()).toContain(f.welcome.code);
    expect(lastRoom(f.peer).players).toHaveLength(1);
    // And a vote in a friends' room is ignored.
    send(f.conn, { t: 'vote', trackId: 'ikorodu' });
    expect(lastRoom(f.peer).quick).toBeUndefined();
  });
});

describe('voice signalling', () => {
  const offer = { kind: 'offer', sdp: 'v=0' };

  function pair() {
    const a = create('Ade');
    const b = join(msgs(a.peer, 'welcome')[0].code, 'Bola');
    return { a, b, aSlot: msgs(a.peer, 'welcome')[0].slot, bSlot: msgs(b.peer, 'welcome')[0].slot };
  }

  it('passes a signal to the named player, saying who sent it', () => {
    const { a, b, aSlot, bSlot } = pair();
    send(a.conn, { t: 'rtc', to: bSlot, signal: offer });
    expect(msgs(b.peer, 'rtc')).toEqual([{ t: 'rtc', from: aSlot, signal: offer }]);
    expect(msgs(a.peer, 'rtc')).toEqual([]);
  });

  it('relays ice candidates and drops malformed or oversize signals', () => {
    const { a, b, bSlot } = pair();
    send(a.conn, { t: 'rtc', to: bSlot, signal: { kind: 'ice', candidate: 'candidate:1', mid: '0', index: 0 } });
    send(a.conn, { t: 'rtc', to: bSlot, signal: { kind: 'offer', sdp: 'x'.repeat(4000) } });
    send(a.conn, { t: 'rtc', to: bSlot, signal: { kind: 'bogus' } });
    send(a.conn, { t: 'rtc', to: 'b', signal: offer });
    expect(msgs(b.peer, 'rtc')).toHaveLength(1);
  });

  it('goes nowhere for yourself, an empty seat or another room', () => {
    const { a, aSlot } = pair();
    const other = create('Chidi');
    send(a.conn, { t: 'rtc', to: aSlot, signal: offer });
    send(a.conn, { t: 'rtc', to: 5, signal: offer });
    expect(msgs(a.peer, 'rtc')).toEqual([]);
    expect(msgs(other.peer, 'rtc')).toEqual([]);
  });

  it('is not offered in a Quick room', () => {
    const a = connect();
    const b = connect();
    send(a.conn, { t: 'quick', name: 'Ade', vehicle: 'okada' });
    send(b.conn, { t: 'quick', name: 'Bola', vehicle: 'okada' });
    send(a.conn, { t: 'rtc', to: msgs(b.peer, 'welcome')[0].slot, signal: offer });
    expect(msgs(b.peer, 'rtc')).toEqual([]);
  });
});
