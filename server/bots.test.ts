import { describe, it, expect } from 'vitest';
import { BOT_NAMES, Roster } from './bots';
import { AI_NAMES } from '../src/game/names';
import { cleanNick, GRID_SIZE, BOT_SLOT_BASE } from '../src/net/protocol';
import { VEHICLES } from '../src/config/vehicles';

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const human = (name: string, vehicle: 'okada' | 'keke' | 'danfo' | 'brt' = 'okada', paint = 'red') => ({ name, vehicle, paint });

describe('bot roster', () => {
  it('names are unique and never AI_NAMES', () => {
    expect(BOT_NAMES.length).toBeGreaterThanOrEqual(55);
    expect(new Set(BOT_NAMES.map((n) => n.toLowerCase())).size).toBe(BOT_NAMES.length);
    for (const n of BOT_NAMES) {
      expect(cleanNick(n)).toBe(n);
      expect(n.length).toBeLessThanOrEqual(16);
      expect(AI_NAMES.map((a) => a.toLowerCase())).not.toContain(n.toLowerCase());
    }
  });

  it('appearances fall in 3s..26s', () => {
    for (let seed = 1; seed < 20; seed++) {
      const r = new Roster(seeded(seed), 1000);
      expect(r.visible(1000 + 2999, []).length).toBe(0);
      const times: number[] = [];
      for (let t = 1000; t <= 27000; t += 50) {
        const n = r.visible(t, []).length;
        while (times.length < n) times.push(t);
      }
      expect(times.length).toBe(5);
      for (const t of times) {
        expect(t - 1000).toBeGreaterThanOrEqual(3000);
        expect(t - 1000).toBeLessThanOrEqual(26000);
      }
    }
  });

  it('no bots before 3 s, five at 26 s with zero humans', () => {
    const r = new Roster(seeded(7), 500);
    expect(r.visible(500 + 2999, [])).toHaveLength(0);
    const all = r.visible(500 + 26000, []);
    expect(all).toHaveLength(5);
    expect(all.map((b) => b.slot)).toEqual([0, 1, 2, 3, 4].map((i) => BOT_SLOT_BASE + i));
    expect(new Set(all.map((b) => b.name)).size).toBe(5);
  });

  it('visible count shrinks to GRID_SIZE minus humans', () => {
    const r = new Roster(seeded(3), 0);
    for (let h = 1; h <= 5; h++) {
      const humans = Array.from({ length: h }, (_, i) => human(`P${i}`));
      expect(r.visible(Infinity, humans)).toHaveLength(GRID_SIZE - h);
    }
  });

  it('a bot sharing a human\'s name is renamed', () => {
    const r = new Roster(seeded(5), 0);
    const first = r.visible(Infinity, []);
    const humans = [human(first[0].name.toUpperCase()), human(first[1].name)];
    const out = r.visible(Infinity, humans);
    const names = out.map((b) => b.name.toLowerCase());
    for (const h of humans) expect(names).not.toContain(h.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    for (const b of out) expect(BOT_NAMES).toContain(b.name);
  });

  it('final fill avoids a human\'s exact vehicle and paint', () => {
    for (let seed = 1; seed < 40; seed++) {
      const r = new Roster(seeded(seed), 0);
      const base = r.visible(Infinity, []);
      const humans = base.slice(0, 2).map((b, i) => human(`Human${i}`, b.vehicle, b.paint));
      const out = r.visible(Infinity, humans);
      for (const b of out) for (const h of humans) {
        expect(b.vehicle === h.vehicle && b.paint === h.paint).toBe(false);
      }
      for (const b of out) {
        expect(VEHICLES.find((v) => v.id === b.vehicle)!.paints.map((p) => p.id)).toContain(b.paint);
      }
    }
  });

  it('skills are within 0.85 and 1.0', () => {
    const s = new Roster(seeded(9), 0).skills();
    expect(s).toHaveLength(5);
    for (const x of s) {
      expect(x).toBeGreaterThanOrEqual(0.85);
      expect(x).toBeLessThanOrEqual(1.0);
    }
  });
});
