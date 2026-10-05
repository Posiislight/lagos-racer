import { describe, expect, it } from 'vitest';
import { howToSteps, shouldShowHowTo } from './onboarding';

describe('shouldShowHowTo', () => {
  it('shows to a brand-new player only', () => {
    expect(shouldShowHowTo(false, 0, 0)).toBe(true);
    expect(shouldShowHowTo(true, 0, 0)).toBe(false);
    expect(shouldShowHowTo(false, 1, 0)).toBe(false);
    expect(shouldShowHowTo(false, 0, 2)).toBe(false);
  });
});

describe('howToSteps', () => {
  it('words the controls for keys and touch', () => {
    expect(howToSteps('keys').map(s => s.body).join(' ')).toContain('Space');
    expect(howToSteps('touch').map(s => s.body).join(' ')).toContain('tap USE');
    expect(howToSteps('touch').map(s => s.body).join(' ')).not.toContain('Space');
  });
});
