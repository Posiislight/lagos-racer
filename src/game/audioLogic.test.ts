import { describe, expect, it } from 'vitest';
import { createSampleStore, jujuWarning } from './audioLogic';

const buf = { duration: 1 } as unknown as AudioBuffer;
const bytes = () => Promise.resolve(new ArrayBuffer(8));

describe('jujuWarning', () => {
  it('gets louder and higher as the juju closes in', () => {
    expect(jujuWarning(60, 0).gain).toBeLessThan(jujuWarning(8, 0).gain);
    expect(jujuWarning(8, 0).rate).toBeGreaterThan(jujuWarning(60, 0).rate);
  });

  it('is silent from 80 m away and never louder than 1', () => {
    expect(jujuWarning(80, 0).gain).toBe(0);
    expect(jujuWarning(500, 0).gain).toBe(0);
    expect(jujuWarning(0, 0).gain).toBe(1);
  });

  it('pans towards the side it is coming from', () => {
    expect(jujuWarning(20, Math.PI / 2).pan).toBeCloseTo(-1, 5);
    expect(jujuWarning(20, -Math.PI / 2).pan).toBeCloseTo(1, 5);
    expect(jujuWarning(20, 0).pan).toBeCloseTo(0, 5);
    expect(jujuWarning(20, Math.PI).pan).toBeCloseTo(0, 5);
  });
});

describe('sample store', () => {
  it('returns the decoded buffer after a good load', async () => {
    const s = createSampleStore();
    await s.load('jujuFly', '/audio/juju-fly.ogg', bytes, () => Promise.resolve(buf));
    expect(s.get('jujuFly')).toBe(buf);
  });

  it('stays empty and does not throw when the fetch fails', async () => {
    const s = createSampleStore();
    await expect(s.load('jujuFly', '/x', () => Promise.reject(new Error('404')), () => Promise.resolve(buf))).resolves.toBeUndefined();
    expect(s.get('jujuFly')).toBeUndefined();
  });

  it('stays empty and does not throw when decoding fails', async () => {
    const s = createSampleStore();
    await expect(s.load('oilDrop', '/x', bytes, () => Promise.reject(new Error('bad')))).resolves.toBeUndefined();
    expect(s.get('oilDrop')).toBeUndefined();
  });
});
