import { describe, expect, it } from 'vitest';
import { COOLDOWN_MS, FpsGovernor, GRACE_PERIOD_MS, LOW_STREAK_SECONDS, PROFILES, TARGET_FPS, lowerQuality, startQuality } from './adaptiveQuality';

/** Run frames `ms` apart from `from` for `seconds`; returns the time reached and how many times a drop was asked for. */
function run(g: FpsGovernor, from: number, seconds: number, fps: number) {
  let t = from, drops = 0;
  const step = 1000 / fps, end = from + seconds * 1000;
  while (t < end) { t += step; if (g.frame(t)) drops++; }
  return { t, drops };
}

describe('FpsGovernor', () => {
  it('measures frames per second over one-second windows', () => {
    const g = new FpsGovernor();
    run(g, 0, 3, 50);
    expect(g.fps).toBeCloseTo(50, 0);
  });

  it('ignores a slow start: nothing counts during the grace period', () => {
    const g = new FpsGovernor();
    g.frame(0);
    expect(run(g, 0, GRACE_PERIOD_MS / 1000, 10).drops).toBe(0);
  });

  it('drops after three slow windows in a row, then waits out the cooldown', () => {
    const g = new FpsGovernor();
    const warm = run(g, 0, GRACE_PERIOD_MS / 1000 + 1, 60);
    const slow = run(g, warm.t, LOW_STREAK_SECONDS + 1, 20);
    expect(slow.drops).toBe(1);
    // Still slow, but the cooldown and the three fresh windows come first.
    expect(run(g, slow.t, COOLDOWN_MS / 1000, 20).drops).toBe(0);
  });

  it('asks again only after a fresh run of slow windows', () => {
    const g = new FpsGovernor();
    const warm = run(g, 0, GRACE_PERIOD_MS / 1000 + 1, 60);
    const slow = run(g, warm.t, 20, 15);
    // 20 s at 15 fps: a drop every cooldown + streak, never more often.
    expect(slow.drops).toBeLessThanOrEqual(Math.floor(20 / (COOLDOWN_MS / 1000 + LOW_STREAK_SECONDS)) + 1);
    expect(slow.drops).toBeGreaterThanOrEqual(2);
  });

  it('never drops for a single bad window', () => {
    const g = new FpsGovernor();
    let t = run(g, 0, GRACE_PERIOD_MS / 1000 + 1, 60).t, drops = 0;
    for (let i = 0; i < 10; i++) {
      const bad = run(g, t, 1, TARGET_FPS / 2); t = bad.t; drops += bad.drops;
      const good = run(g, t, 2, 60); t = good.t; drops += good.drops;
    }
    expect(drops).toBe(0);
  });

  it('never drops for two slow windows then a good one', () => {
    const g = new FpsGovernor();
    let t = run(g, 0, GRACE_PERIOD_MS / 1000 + 1, 60).t, drops = 0;
    for (let i = 0; i < 5; i++) {
      const bad = run(g, t, LOW_STREAK_SECONDS - 1, 20); t = bad.t; drops += bad.drops;
      const good = run(g, t, 1.5, 60); t = good.t; drops += good.drops;
    }
    expect(drops).toBe(0);
  });

  it('does not count a stall (hidden tab, debugger) as slow rendering', () => {
    const g = new FpsGovernor();
    let t = run(g, 0, GRACE_PERIOD_MS / 1000 + 1, 60).t, drops = 0;
    for (let i = 0; i < 6; i++) { t += 5000; if (g.frame(t)) drops++; const r = run(g, t, 1, 60); t = r.t; drops += r.drops; }
    expect(drops).toBe(0);
  });

  it('settle() restarts the measuring and holds for the cooldown', () => {
    const g = new FpsGovernor();
    const warm = run(g, 0, GRACE_PERIOD_MS / 1000 + 1, 60);
    run(g, warm.t, 2, 20);
    expect(g.streak).toBeGreaterThan(0);
    g.settle(warm.t + 2000);
    expect(g.streak).toBe(0);
    expect(g.waiting(warm.t + 2000 + COOLDOWN_MS - 1)).toBe(true);
    expect(g.waiting(warm.t + 2000 + COOLDOWN_MS)).toBe(false);
  });
});

describe('quality levels', () => {
  it('steps down one level at a time and stops at low', () => {
    expect(lowerQuality('high')).toBe('medium');
    expect(lowerQuality('medium')).toBe('low');
    expect(lowerQuality('low')).toBeNull();
  });

  it('gets cheaper at every level', () => {
    const { high, medium, low } = PROFILES;
    expect(high.dpr[1]).toBeGreaterThan(medium.dpr[1]);
    expect(medium.dpr[1]).toBeGreaterThanOrEqual(low.dpr[1]);
    expect(high.shadowMap).toBeGreaterThan(medium.shadowMap);
    expect(medium.shadowMap).toBeGreaterThan(low.shadowMap);
    expect(high.far).toBeGreaterThan(medium.far);
    expect(medium.far).toBeGreaterThan(low.far);
    expect(high.density).toBeGreaterThan(low.density);
    expect(high.particles).toBeGreaterThan(low.particles);
  });

  it('starts on medium only for a clearly weak device', () => {
    expect(startQuality({})).toBe('high');
    expect(startQuality({ hardwareConcurrency: 8, deviceMemory: 4 })).toBe('high');
    expect(startQuality({ hardwareConcurrency: 8 })).toBe('high');
    expect(startQuality({ hardwareConcurrency: 8, deviceMemory: 2 })).toBe('medium');
    expect(startQuality({ hardwareConcurrency: 2 })).toBe('medium');
  });
});
