import { beforeEach, describe, expect, it } from 'vitest';
import { RoomServer, type Peer } from './rooms';
import {
  LOAD_TIMEOUT_MS,
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
  send(data: string | ArrayBuffer) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
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
  server = new RoomServer({ now: () => now, random });
});

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
    expect(room.players).toEqual([{ slot: 1, name: 'Ade', vehicle: 'okada', ready: false, connected: true }]);
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

  it('frees the slot after 15 s without a resume and hands host to the lowest slot', () => {
    const a = create();
    const b = join(a.welcome.code);
    join(a.welcome.code);
    server.close(a.conn);
    now += RECONNECT_GRACE_MS - 1;
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
    now += RECONNECT_GRACE_MS;
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
        { netId: 0, slot: 1, name: 'Ade', vehicle: 'okada', ai: false },
        { netId: 1, slot: 2, name: 'Bola', vehicle: 'keke', ai: false },
      ]);
    }
    expect(msgs(a.peer, 'grid')[0].seed).toBe(msgs(b.peer, 'grid')[0].seed);
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

describe('snapshot relay', () => {
  const car = (netId: number, over: Partial<CarState> = {}): CarState => ({
    netId, x: 1, y: 0.5, z: -3, qx: 0, qy: 0, qz: 0, qw: 1, vx: 0, vy: 0, vz: 12, distance: 40, laps: 0, flags: 0, ...over,
  });
  const snap = (slot: number, over: Partial<Snapshot> = {}): Snapshot => ({ slot, raceSeq: 1, time: 2.5, cars: [car(slot - 1)], ...over });
  const binary = (peer: FakePeer) => peer.sent.filter((d): d is ArrayBuffer => typeof d !== 'string');

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
