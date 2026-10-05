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

const { useNet, ERROR_TEXT } = await import('./store');
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
});
