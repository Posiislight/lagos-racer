import { describe, expect, it } from 'vitest';
import { PRODUCTION_ROOM_SERVER, roomServerUrl } from './server';

describe('roomServerUrl', () => {
  it('uses a valid variable, tidying whitespace and a trailing slash', () => {
    expect(roomServerUrl('wss://rooms.example', true, 'x')).toBe('wss://rooms.example');
    expect(roomServerUrl(' wss://rooms.example/ ', true, 'x')).toBe('wss://rooms.example');
    expect(roomServerUrl('ws://localhost:8787', false, 'x')).toBe('ws://localhost:8787');
  });

  it('falls back to the hosted server in production when the variable is missing or unusable', () => {
    expect(roomServerUrl(undefined, true, 'x')).toBe(PRODUCTION_ROOM_SERVER);
    expect(roomServerUrl('', true, 'x')).toBe(PRODUCTION_ROOM_SERVER);
    expect(roomServerUrl('https://rooms.example', true, 'x')).toBe(PRODUCTION_ROOM_SERVER);
    expect(roomServerUrl('wss://rooms.example/path', true, 'x')).toBe(PRODUCTION_ROOM_SERVER);
  });

  it('uses the page host on port 8787 in development', () => {
    expect(roomServerUrl(undefined, false, '192.168.0.5')).toBe('ws://192.168.0.5:8787');
  });
});
