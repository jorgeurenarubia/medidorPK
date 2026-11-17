import { describe, it, expect } from 'vitest';
import { Tracker } from '../src/tracker.js';
import { destination } from '../src/geo.js';

const ORIGIN = { lat: 40.4, lon: -3.7 };

/** Genera puntos en línea recta: cada `stepM` metros cada `stepS` segundos. */
function drive(tracker, from, n, stepM, stepS, t0, extra = {}) {
  let p = from;
  let t = t0;
  for (let i = 0; i < n; i++) {
    p = destination(p, stepM, 90);
    t += stepS * 1000;
    tracker.addPoint({ ...p, t, acc: 5, ...extra });
  }
  return { p, t };
}

describe('Tracker', () => {
  it('suma la distancia recorrida', () => {
    const tr = new Tracker();
    tr.start(0);
    tr.addPoint({ ...ORIGIN, t: 0, acc: 5 });
    drive(tr, ORIGIN, 100, 15, 1, 0); // 100 × 15 m a 54 km/h
    expect(tr.distance).toBeCloseTo(1500, 0);
  });

  it('no suma estando en pausa ni une los segmentos', () => {
    const tr = new Tracker();
    tr.start(0);
    tr.addPoint({ ...ORIGIN, t: 0, acc: 5 });
    let { p, t } = drive(tr, ORIGIN, 10, 20, 1, 0); // 200 m
    tr.pause(t);
    ({ p, t } = drive(tr, p, 50, 20, 1, t)); // 1000 m en pausa: no cuentan
    tr.resume(t);
    tr.addPoint({ ...p, t: t + 1000, acc: 5 });
    drive(tr, p, 10, 20, 1, t + 1000); // 200 m
    expect(tr.distance).toBeCloseTo(400, 0);
    expect(tr.segments.length).toBe(2);
  });

  it('ignora la deriva del GPS estando parado', () => {
    const tr = new Tracker();
    tr.start(0);
    tr.addPoint({ ...ORIGIN, t: 0, acc: 8 });
    for (let i = 1; i <= 300; i++) {
      const jitter = destination(ORIGIN, (i % 3) * 1.5, (i * 47) % 360);
      tr.addPoint({ ...jitter, t: i * 1000, acc: 8, speed: 0 });
    }
    expect(tr.distance).toBe(0);
  });

  it('el avance lento acaba sumando (el ancla no se mueve)', () => {
    const tr = new Tracker();
    tr.start(0);
    tr.addPoint({ ...ORIGIN, t: 0, acc: 4 });
    drive(tr, ORIGIN, 100, 1, 1, 0); // 100 m a 1 m/s, pasos menores que el umbral
    expect(tr.distance).toBeGreaterThan(95);
    expect(tr.distance).toBeLessThanOrEqual(100.01);
  });

  it('descarta puntos imprecisos y saltos imposibles', () => {
    const tr = new Tracker();
    tr.start(0);
    tr.addPoint({ ...ORIGIN, t: 0, acc: 5 });
    expect(tr.addPoint({ ...destination(ORIGIN, 50, 0), t: 1000, acc: 80 })).toBe('inaccurate');
    expect(tr.addPoint({ ...destination(ORIGIN, 2000, 0), t: 2000, acc: 5 })).toBe('jump');
    expect(tr.distance).toBe(0);
  });

  it('si el primer punto era malo, se recupera tras varios rechazos', () => {
    const tr = new Tracker();
    tr.start(0);
    tr.addPoint({ ...destination(ORIGIN, 5000, 0), t: 0, acc: 5 }); // ancla errónea
    tr.addPoint({ ...ORIGIN, t: 0, acc: 5 }); // dt = 0 → ignorado
    let t = 0;
    for (let i = 0; i < 5; i++) tr.addPoint({ ...ORIGIN, t: (t += 1000), acc: 5 });
    expect(tr.points()[0].lat).toBeCloseTo(ORIGIN.lat, 6);
    drive(tr, ORIGIN, 10, 20, 1, t);
    expect(tr.distance).toBeCloseTo(200, 0);
  });

  it('registra huecos sin señal', () => {
    const tr = new Tracker();
    tr.start(0);
    tr.addPoint({ ...ORIGIN, t: 0, acc: 5 });
    tr.addPoint({ ...destination(ORIGIN, 600, 90), t: 40_000, acc: 5 });
    expect(tr.gaps).toEqual([{ t: 40_000, seconds: 40, meters: 600 }]);
    expect(tr.distance).toBeCloseTo(600, 0);
  });

  it('tiempo activo sin pausas y serialización', () => {
    const tr = new Tracker();
    tr.start(0);
    tr.pause(10_000);
    tr.resume(25_000);
    expect(tr.elapsed(30_000)).toBe(15_000);
    const copy = Tracker.fromJSON(JSON.parse(JSON.stringify(tr)));
    expect(copy.status).toBe('running');
    expect(copy.elapsed(30_000)).toBe(15_000);
    copy.finish(40_000);
    expect(copy.status).toBe('finished');
    expect(copy.elapsed()).toBe(25_000);
  });
});
