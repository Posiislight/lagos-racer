import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClientMessage } from './protocol';
import { ClockSync } from './clock';
import type { NetLink } from './connection';
import { NetSession } from './session';

function fakeLink() {
  const sent: ClientMessage[] = [];
  const link: NetLink = { sendJson: m => { sent.push(m); }, sendBinary: () => {} };
  return { link, sent };
}

/** A clock whose server time runs 10 s ahead of performance.now(). */
function clockAhead() {
  const clock = new ClockSync();
  clock.addSample(0, 10000, 0);
  return clock;
}

const setup = { grid: [], mySlot: 1, seed: 7, raceSeq: 1 };

describe('NetSession', () => {
  afterEach(() => vi.restoreAllMocks());

  it('now() is negative before start and counts seconds from the server start time', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const s = new NetSession(fakeLink().link, clockAhead(), setup);
    expect(s.started).toBe(false);
    expect(s.now()).toBe(-3.5);
    // Server time is now 11000: the start is 3 s away.
    s.setStart(14000);
    expect(s.started).toBe(true);
    expect(s.now()).toBeCloseTo(-3);
    now.mockReturnValue(6500);
    expect(s.now()).toBeCloseTo(2.5);
  });

  it('sends loaded exactly once', () => {
    const { link, sent } = fakeLink();
    const s = new NetSession(link, clockAhead(), setup);
    s.loaded();
    s.loaded();
    expect(sent).toEqual([{ t: 'loaded' }]);
  });

  it('attach makes the session the race hooks', () => {
    const s = new NetSession(fakeLink().link, clockAhead(), setup);
    const race = { net: null } as unknown as Parameters<NetSession['attach']>[0];
    s.attach(race);
    expect(race.net).toBe(s);
  });
});
