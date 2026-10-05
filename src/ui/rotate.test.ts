import { describe, expect, it } from 'vitest';
import { shouldPauseForRotate, shouldPromptRotate } from './rotate';

describe('shouldPromptRotate', () => {
  it('prompts only on a touch device held upright', () => {
    expect(shouldPromptRotate(true, true)).toBe(true);
    expect(shouldPromptRotate(true, false)).toBe(false);
    expect(shouldPromptRotate(false, true)).toBe(false);
    expect(shouldPromptRotate(false, false)).toBe(false);
  });
});

describe('shouldPauseForRotate', () => {
  it('pauses a solo race that is running while the prompt shows', () => {
    expect(shouldPauseForRotate(true, 'race', false, false, false)).toBe(true);
  });
  it('does nothing otherwise', () => {
    expect(shouldPauseForRotate(false, 'race', false, false, false)).toBe(false);
    expect(shouldPauseForRotate(true, 'menu', false, false, false)).toBe(false);
    expect(shouldPauseForRotate(true, 'race', true, false, false)).toBe(false);
    expect(shouldPauseForRotate(true, 'race', false, true, false)).toBe(false);
    expect(shouldPauseForRotate(true, 'race', false, false, true)).toBe(false);
  });
});
