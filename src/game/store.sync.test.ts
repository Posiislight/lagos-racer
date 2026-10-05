import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVE_KEY, defaultSave } from './save';
import { onSaved, useGame } from './store';
import { pickSynced } from './syncSave';

const mem = new Map<string, string>();

beforeEach(() => {
  mem.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
  useGame.setState({ coins: 400, races: 3, itemHints: 4, settings: { ...defaultSave().settings, quality: 'low' } });
});

describe('applyRemoteSave', () => {
  it('replaces synced progress and keeps this phone\'s own settings', () => {
    useGame.getState().applyRemoteSave({ ...pickSynced(defaultSave()), coins: 900, races: 7 });
    const s = useGame.getState();
    expect(s.coins).toBe(900);
    expect(s.races).toBe(7);
    expect(s.itemHints).toBe(4);
    expect(s.settings.quality).toBe('low');
  });

  it('keeps a backup of the save it replaced, and writes the new one', () => {
    useGame.getState().applyRemoteSave({ ...pickSynced(defaultSave()), coins: 900 });
    expect(JSON.parse(mem.get(`${SAVE_KEY}:backup`)!).coins).toBe(400);
    expect(JSON.parse(mem.get(SAVE_KEY)!).coins).toBe(900);
  });
});

describe('onSaved', () => {
  it('fires after a save, and not after unsubscribing', () => {
    const fn = vi.fn();
    const off = onSaved(fn);
    useGame.getState().dismissAccountPrompt();
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    useGame.getState().dismissAccountPrompt();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
