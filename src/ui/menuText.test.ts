import { describe, expect, it } from 'vitest';
import { MENU_TAGLINE, menuCredit } from './menuText';

describe('menu text', () => {
  it('has a tagline that no longer says Grand Prix', () => {
    expect(MENU_TAGLINE).not.toContain('Grand Prix');
  });
  it('credits the first track that has a credit', () => {
    expect(menuCredit([{}, { credit: '© OpenStreetMap contributors' }])).toBe('© OpenStreetMap contributors');
  });
  it('has no credit when no track has one', () => {
    expect(menuCredit([{}])).toBeNull();
  });
});
