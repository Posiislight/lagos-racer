import { describe, expect, it } from 'vitest';
import { defaultSave } from './save';
import { SYNCED_KEYS, decideSignIn, hasProgress, mergeRemote, normaliseSynced, pickSynced } from './syncSave';

const played = () => ({ ...defaultSave(), races: 3, coins: 400 });

describe('pickSynced', () => {
  it('leaves out the per-device fields and keeps roomEarned', () => {
    const p = pickSynced(defaultSave()) as Record<string, unknown>;
    expect('settings' in p).toBe(false);
    expect('accountPromptDismissed' in p).toBe(false);
    expect('itemHints' in p).toBe(false);
    expect('roomEarned' in p).toBe(true);
  });
});

describe('mergeRemote', () => {
  it('takes remote synced fields and keeps local per-device fields', () => {
    const local = { ...played(), itemHints: 4, settings: { ...defaultSave().settings, quality: 'low' as const } };
    const merged = mergeRemote(local, { ...pickSynced(defaultSave()), coins: 900 });
    expect(merged.coins).toBe(900);
    expect(merged.itemHints).toBe(4);
    expect(merged.settings.quality).toBe('low');
  });
});

describe('decideSignIn', () => {
  const empty = pickSynced(defaultSave());
  const cloud = pickSynced(played());
  it('uploads local progress when the account has no save', () => expect(decideSignIn(played(), null)).toBe('upload'));
  it('does nothing when neither side has progress', () => {
    expect(decideSignIn(defaultSave(), null)).toBe('none');
    expect(decideSignIn(defaultSave(), empty)).toBe('none');
  });
  it('downloads when the account has progress', () => {
    expect(decideSignIn(played(), cloud)).toBe('download');
    expect(decideSignIn(defaultSave(), cloud)).toBe('download');
  });
  it('uploads over an empty cloud save', () => expect(decideSignIn(played(), empty)).toBe('upload'));
});

describe('hasProgress', () => {
  it('is false for a fresh save and true once anything is earned', () => {
    expect(hasProgress(defaultSave())).toBe(false);
    expect(hasProgress({ races: 0, coins: 0, premium: 5 })).toBe(true);
  });
});

describe('normaliseSynced', () => {
  it('returns exactly the synced keys and clamps bad values', () => {
    const n = normaliseSynced({ premium: -5, junk: 1 });
    expect(Object.keys(n).sort()).toEqual([...SYNCED_KEYS].sort());
    expect(n.premium).toBeGreaterThanOrEqual(0);
    expect(Object.keys(normaliseSynced('nonsense')).sort()).toEqual([...SYNCED_KEYS].sort());
  });
});
