import { describe, it, expect } from 'vitest';
import { parsePk, formatPk, endPk } from '../src/pk.js';

describe('pk', () => {
  it('parsea formatos habituales', () => {
    expect(parsePk('12+350')).toBe(12350);
    expect(parsePk(' 12 + 35 ')).toBe(12035);
    expect(parsePk('12')).toBe(12000);
    expect(parsePk('12,35')).toBe(12350);
    expect(parsePk('12.350')).toBe(12350);
    expect(parsePk('0+005')).toBe(5);
    expect(parsePk('')).toBeNull();
    expect(parsePk('abc')).toBeNull();
    expect(parsePk('12+3500')).toBeNull();
  });

  it('formatea', () => {
    expect(formatPk(12350)).toBe('12+350');
    expect(formatPk(5)).toBe('0+005');
    expect(formatPk(13595.4)).toBe('13+595');
    expect(formatPk(null)).toBe('—');
  });

  it('PK final según sentido', () => {
    expect(formatPk(endPk(12350, 1245, 1))).toBe('13+595');
    expect(formatPk(endPk(12350, 1245, -1))).toBe('11+105');
    expect(endPk(null, 1245, 1)).toBeNull();
  });
});
