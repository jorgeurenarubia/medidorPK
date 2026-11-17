import { describe, it, expect } from 'vitest';
import { haversine, destination, pathLength, formatKm, formatDuration } from '../src/geo.js';

describe('geo', () => {
  it('haversine: 1 grado de latitud ≈ 111,2 km', () => {
    expect(haversine({ lat: 40, lon: -3 }, { lat: 41, lon: -3 })).toBeCloseTo(111195, -1);
  });

  it('Madrid (Sol) → Toledo ≈ 67 km', () => {
    const d = haversine({ lat: 40.4169, lon: -3.7035 }, { lat: 39.8628, lon: -4.0273 });
    expect(d / 1000).toBeGreaterThan(66);
    expect(d / 1000).toBeLessThan(68);
  });

  it('destination y haversine son coherentes', () => {
    const a = { lat: 40.4, lon: -3.7 };
    const b = destination(a, 1234, 57);
    expect(haversine(a, b)).toBeCloseTo(1234, 3);
  });

  it('pathLength suma tramos', () => {
    const a = { lat: 40.4, lon: -3.7 };
    const b = destination(a, 100, 0);
    const c = destination(b, 250, 90);
    expect(pathLength([a, b, c])).toBeCloseTo(350, 3);
  });

  it('formatos', () => {
    expect(formatKm(1245)).toBe('1,245');
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
  });
});
