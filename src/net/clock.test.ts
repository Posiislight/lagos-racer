import { describe, expect, it } from 'vitest';
import { ClockSync } from './clock';

describe('ClockSync', () => {
  it('uses the lowest-latency sample', () => {
    const c = new ClockSync();
    c.addSample(1000, 50_000, 1300); // rtt 300, offset 48_850
    c.addSample(2000, 51_060, 2080); // rtt 80, offset 49_020
    expect(c.rtt).toBe(80);
    expect(c.offset).toBe(49_020);
    expect(c.serverNow(3000)).toBe(52_020);
  });

  it('forgets samples older than the last 8', () => {
    const c = new ClockSync();
    c.addSample(0, 10_000, 40); // fast sample, rtt 40
    for (let i = 1; i <= 8; i++) c.addSample(i * 1000, 20_000 + i * 1000, i * 1000 + 200); // rtt 200
    expect(c.rtt).toBe(200);
  });

  it('is not synced before any sample', () => {
    const c = new ClockSync();
    expect(c.synced).toBe(false);
    c.addSample(0, 100, 20);
    expect(c.synced).toBe(true);
  });
});
