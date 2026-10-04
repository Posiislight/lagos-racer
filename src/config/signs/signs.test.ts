import { describe, expect, it } from 'vitest';
import { signsFor } from './ikorodu';
import { trackById } from '../tracks';

describe('ikorodu signs', () => {
  const ik = trackById('ikorodu');

  it('generic signage returns no signs', () => {
    expect(signsFor({ ...ik, signage: 'generic' })).toEqual([]);
  });

  it('real signage returns the seven verified signs', () => {
    expect(signsFor({ ...ik, signage: 'real' }).map(s => s.id).sort())
      .toEqual(['ap', 'autocad', 'kfc', 'mosque', 'paypoint', 'tailoring', 'tcl']);
  });

  it('the Ikorodu track uses real signage', () => {
    expect(ik.signage).toBe('real');
  });

  it('never carries text that was only partly read or inferred', () => {
    const all = signsFor({ ...ik, signage: 'real' }).flatMap(s => s.text).join(' ');
    for (const bad of ['IKOR…', 'KD Lounge', 'ZENITH', 'JAMB', 'BUILDER', 'chicken', 'General Hospital', 'EXCLUSIVE', 'ETHNIC', 'Access Bank', 'Skye', 'Forte', 'Accion', 'Primero'])
      expect(all.toLowerCase()).not.toContain(bad.toLowerCase());
  });

  it('every sign says where it is and where it was read', () => {
    for (const s of signsFor({ ...ik, signage: 'real' })) {
      expect(s.where.length).toBeGreaterThan(3);
      expect(s.source.length).toBeGreaterThan(3);
      expect(s.text.length).toBeGreaterThan(0);
    }
  });

  it('ojuelegba has no signs from this file', () => {
    expect(signsFor(trackById('ojuelegba'))).toEqual([]);
  });
});
