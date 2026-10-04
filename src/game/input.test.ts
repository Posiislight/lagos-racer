import { describe, expect, it } from 'vitest';
import { swallowKey } from './input';

const key = (code: string, o: { ctrlKey?: boolean; key?: string } = {}) => ({ code, key: o.key ?? '', ctrlKey: !!o.ctrlKey });

describe('swallowKey', () => {
  it('stops Ctrl + a game key opening browser dialogs while drifting (bookmark, save, select all…)', () => {
    for (const code of ['KeyD', 'KeyS', 'KeyA', 'KeyW', 'KeyE', 'KeyF', 'KeyH']) expect(swallowKey(key(code, { ctrlKey: true }))).toBe(true);
  });

  it('stops arrows and Space scrolling the page', () => {
    expect(swallowKey(key('ArrowLeft', { key: 'ArrowLeft' }))).toBe(true);
    expect(swallowKey(key('Space', { key: ' ' }))).toBe(true);
  });

  it('leaves other shortcuts alone (reload, copy, plain letters)', () => {
    expect(swallowKey(key('KeyR', { ctrlKey: true }))).toBe(false);
    expect(swallowKey(key('KeyC', { ctrlKey: true }))).toBe(false);
    expect(swallowKey(key('KeyD'))).toBe(false);
  });
});
