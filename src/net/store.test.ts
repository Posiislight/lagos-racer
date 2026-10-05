import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientMessage, ServerMessage } from './protocol';

const mock = vi.hoisted(() => ({
  sent: [] as ClientMessage[],
  handlers: null as null | { onOpen(r: boolean): void; onMessage(m: ServerMessage): void; onStatus(s: string): void },
}));

vi.mock('./connection', () => ({
  parseLagSim: () => null,
  Connection: class {
    constructor(_url: string, h: NonNullable<typeof mock.handlers>) { mock.handlers = h; }
    sendJson(m: ClientMessage) { mock.sent.push(m); }
    sendBinary() {}
    wake() {}
    close() {}
  },
}));
vi.mock('../game/audio', () => ({ sfx: vi.fn() }));

vi.stubGlobal('location', { search: '', hostname: 'localhost' });
vi.stubGlobal('window', {});

const { useNet, ERROR_TEXT, getSession } = await import('./store');
const { useGame } = await import('../game/store');

beforeEach(() => {
  useNet.getState().leave();
  mock.sent.length = 0;
  mock.handlers = null;
  useNet.setState({ error: null });
  useGame.getState().setScreen('online');
});

describe('quick race entry', () => {
  it('quick opens a socket and sends the quick message with the nickname', () => {
    useNet.getState().quick('  Ada  ', 'okada', 'red');
    expect(mock.handlers).not.toBeNull();
    mock.handlers!.onOpen(false);
    expect(mock.sent).toEqual([{ t: 'quick', name: 'Ada', vehicle: 'okada', paint: 'red' }]);
  });

  it('bad nickname sets bad-name and sends nothing', () => {
    useNet.getState().quick('   ', 'okada', 'red');
    expect(useNet.getState().error).toBe('bad-name');
    expect(mock.handlers).toBeNull();
    expect(mock.sent).toEqual([]);
  });

  it('vote sends the vote message and remembers it', () => {
    useNet.getState().quick('Ada', 'okada', 'red');
    mock.handlers!.onOpen(false);
    mock.sent.length = 0;
    useNet.getState().vote('ikorodu');
    expect(mock.sent).toEqual([{ t: 'vote', trackId: 'ikorodu' }]);
    expect(useNet.getState().myVote).toBe('ikorodu');
  });

  it('busy error shows the busy text and stays on the online screen', () => {
    useNet.getState().quick('Ada', 'okada', 'red');
    mock.handlers!.onOpen(false);
    mock.handlers!.onMessage({ t: 'error', error: 'busy' });
    expect(useNet.getState().error).toBe('busy');
    expect(ERROR_TEXT.busy).toBeTruthy();
    expect(useGame.getState().screen).toBe('online');
  });

  it('a room message stamps its arrival time for the countdown', () => {
    useNet.getState().quick('Ada', 'okada', 'red');
    mock.handlers!.onOpen(false);
    const before = Date.now();
    mock.handlers!.onMessage({ t: 'room', room: { code: 'ABCD', phase: 'lobby', hostSlot: 0, fillAI: false, raceSeq: 0, players: [], quick: { startsInMs: 20000, votes: {} } } });
    expect(useNet.getState().roomAt).toBeGreaterThanOrEqual(before);
  });

  /** Seated in a room whose view is `quick` or not, then given a race grid. */
  function raceIn(quick: boolean) {
    useNet.getState().quick('Ada', 'okada', 'red');
    mock.handlers!.onOpen(false);
    mock.handlers!.onMessage({ t: 'welcome', code: 'ABCD', slot: 1, token: 'tok' });
    mock.handlers!.onMessage({ t: 'room', room: { code: 'ABCD', phase: 'loading', hostSlot: 1, fillAI: false, raceSeq: 1, players: [], ...(quick ? { quick: { startsInMs: 0, votes: {} } } : {}) } });
    const grid = [{ netId: 0, slot: 1, name: 'Ada', vehicle: 'okada' as const, paint: 'red', ai: false }, { netId: 1, slot: 2, name: 'Kunle9ja', vehicle: 'keke' as const, paint: 'red', ai: false }];
    mock.handlers!.onMessage({ t: 'grid', raceSeq: 1, grid, seed: 5, trackId: 'ojuelegba', laps: 3 });
    return getSession()!;
  }

  it("a race in a Quick room is set up as quick; one in a friends' room is not", () => {
    expect(raceIn(true).setup.quick).toBe(true);
    expect(raceIn(false).setup.quick).toBe(false);
  });

  it('race again leaves the room and sends a fresh quick message', () => {
    raceIn(true);
    mock.sent.length = 0;
    const first = mock.handlers;
    useNet.getState().raceAgain('keke', 'blue');
    expect(mock.sent).toEqual([{ t: 'leave' }]);
    expect(useNet.getState().code).toBeNull();
    expect(useGame.getState().screen).toBe('online');
    expect(useGame.getState().online).toBe(false);
    expect(mock.handlers).not.toBe(first);
    mock.handlers!.onOpen(false);
    expect(mock.sent).toEqual([{ t: 'leave' }, { t: 'quick', name: 'Ada', vehicle: 'keke', paint: 'blue' }]);
  });

  it('adopt hands the named bot cars to the race session', () => {
    const session = raceIn(true);
    const adopt = vi.spyOn(session, 'adopt');
    mock.handlers!.onMessage({ t: 'adopt', netIds: [1] });
    expect(adopt).toHaveBeenCalledExactlyOnceWith([1]);
  });
});
