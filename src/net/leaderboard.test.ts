import { describe, expect, it } from 'vitest';
import { fetchTimes, fetchWeekly } from './leaderboard';

const BASE = 'http://rooms.test';
const reply = (status: number, body: unknown): typeof fetch => async () => new Response(JSON.stringify(body), { status });
const board = { rows: [{ key: 'ada', name: 'Ada', value: 12, seed: false }], me: null, week: '2026-10-05', lastWinner: null };

describe('leaderboard fetch', () => {
  it('asks the room server for the weekly board with the nickname encoded', async () => {
    let asked = '';
    const f: typeof fetch = async (input) => { asked = String(input); return new Response(JSON.stringify(board)); };
    expect(await fetchWeekly('Odogwu & Co', f, BASE)).toEqual(board);
    expect(asked).toMatch(/\/leaderboard\/weekly\?name=Odogwu%20%26%20Co$/);
  });

  it('asks for one track with the track and the nickname', async () => {
    let asked = '';
    const f: typeof fetch = async (input) => { asked = String(input); return new Response(JSON.stringify(board)); };
    await fetchTimes('third-mainland', 'Ada', f, BASE);
    expect(asked).toMatch(/\/leaderboard\/times\?track=third-mainland&name=Ada$/);
  });

  it('gives null on an error status, a network failure or a body that is not a board', async () => {
    expect(await fetchWeekly('Ada', reply(503, {}), BASE)).toBeNull();
    expect(await fetchWeekly('Ada', async () => { throw new Error('offline'); }, BASE)).toBeNull();
    expect(await fetchTimes('ojuelegba', 'Ada', reply(200, { nope: true }), BASE)).toBeNull();
    expect(await fetchWeekly('Ada', async () => new Response('not json'), BASE)).toBeNull();
  });
});
