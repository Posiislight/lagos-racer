import { describe, expect, it } from 'vitest';
import { iceServers } from './voice';

describe('iceServers', () => {
  it('is STUN only without a TURN url', () => {
    const s = iceServers(undefined, undefined, undefined);
    expect(s.every(x => String(x.urls).startsWith('stun:'))).toBe(true);
    expect(iceServers('  ', 'u', 'c')).toEqual(s);
  });

  it('adds a TURN entry with its username and credential', () => {
    const turn = iceServers('turn:a.example:3478', 'user', 'pass').at(-1);
    expect(turn).toEqual({ urls: ['turn:a.example:3478'], username: 'user', credential: 'pass' });
  });

  it('splits and trims comma-separated urls', () => {
    const turn = iceServers(' turn:a:3478?transport=udp , turns:a:5349 ,', 'u', 'c').at(-1);
    expect(turn?.urls).toEqual(['turn:a:3478?transport=udp', 'turns:a:5349']);
  });
});
