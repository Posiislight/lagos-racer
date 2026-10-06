import { describe, expect, it } from 'vitest';
import { deviceId } from './deviceId';

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

describe('deviceId', () => {
  it('makes a uuid once and keeps it', () => {
    const s = memory();
    const a = deviceId(s);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(deviceId(s)).toBe(a);
  });

  it('replaces a damaged stored value', () => {
    const s = memory();
    s.setItem('lagos-racer:device-id', 'junk');
    expect(deviceId(s)).not.toBe('junk');
  });

  it('still returns an id when storage throws', () => {
    const broken = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); } };
    expect(deviceId(broken)).toMatch(/^[0-9a-f-]{36}$/);
  });
});
