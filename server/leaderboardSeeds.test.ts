import { describe, expect, it } from 'vitest';
import { makeSeeds } from './leaderboardSeeds';
import { playerKey, weekStart } from '../src/game/leaderboard';
import { TRACKS, trackFor } from '../src/config/tracks';
import { vehicleById } from '../src/config/vehicles';
import { maxTopSpeed } from '../src/game/upgrades';
import { cleanNick } from '../src/net/protocol';

const lcg = (s: number) => () => (s = (s * 16807) % 2147483647) / 2147483647;
const NOW = Date.UTC(2026, 9, 6, 12, 0);

describe('makeSeeds', () => {
  const rows = makeSeeds(lcg(7), NOW);

  it('makes 40 distinct nicknames that a real player could have typed', () => {
    const names = new Map(rows.map(r => [r.key, r.name]));
    expect(names.size).toBe(40);
    for (const [key, name] of names) {
      expect(cleanNick(name)).toBe(name);
      expect(playerKey(name)).toBe(key);
    }
  });

  it('gives every seed a time on every track, one vehicle each', () => {
    for (const key of new Set(rows.map(r => r.key))) {
      const own = rows.filter(r => r.key === key);
      expect(own.map(r => r.trackId).sort()).toEqual(TRACKS.map(t => t.id).sort());
      expect(new Set(own.map(r => r.vehicle)).size).toBe(1);
    }
  });

  it('keeps every time inside what the referee would accept and a believable pace', () => {
    for (const r of rows) {
      const cfg = TRACKS.find(t => t.id === r.trackId)!;
      const distance = cfg.laps * trackFor(cfg).length;
      const top = maxTopSpeed(vehicleById(r.vehicle));
      expect(r.timeMs / 1000).toBeGreaterThanOrEqual(distance / (top * 1.6));
      expect(r.timeMs / 1000).toBeLessThanOrEqual(distance / (top * 0.55) + 0.001);
    }
  });

  it('scores this week with 1 to 60 points, the same on each of a seed\'s rows', () => {
    for (const r of rows) {
      expect(r.week).toBe(weekStart(NOW));
      expect(r.points).toBeGreaterThanOrEqual(1);
      expect(r.points).toBeLessThanOrEqual(60);
    }
    for (const key of new Set(rows.map(r => r.key))) expect(new Set(rows.filter(r => r.key === key).map(r => r.points)).size).toBe(1);
  });

  it('is repeatable for a given random source', () => {
    expect(makeSeeds(lcg(7), NOW)).toEqual(rows);
  });
});
