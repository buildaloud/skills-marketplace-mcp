import { describe, it, expect } from 'vitest';
import { getDangerLevel } from './danger-level.js';

describe('getDangerLevel', () => {
  it('returns low for 0', () => {
    expect(getDangerLevel(0)).toBe('low');
  });

  it('returns low at boundary (5)', () => {
    expect(getDangerLevel(5)).toBe('low');
  });

  it('returns medium just above low boundary (5.01)', () => {
    expect(getDangerLevel(5.01)).toBe('medium');
  });

  it('returns medium at boundary (20)', () => {
    expect(getDangerLevel(20)).toBe('medium');
  });

  it('returns high just above medium boundary (20.01)', () => {
    expect(getDangerLevel(20.01)).toBe('high');
  });

  it('returns high at boundary (50)', () => {
    expect(getDangerLevel(50)).toBe('high');
  });

  it('returns critical just above high boundary (50.01)', () => {
    expect(getDangerLevel(50.01)).toBe('critical');
  });

  it('returns critical at max (100)', () => {
    expect(getDangerLevel(100)).toBe('critical');
  });
});
