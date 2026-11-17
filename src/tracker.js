// Máquina de estados de una medición: idle → running ⇄ paused → finished.
// Es serializable (toJSON/fromJSON) para poder recuperarla si la app se cierra.

import { haversine } from './geo.js';

export const DEFAULTS = {
  maxAccuracy: 25, // m: puntos menos precisos se descartan
  maxSpeed: 200 / 3.6, // m/s: saltos más rápidos se consideran error de GPS
  minStep: 3, // m: movimiento mínimo para sumar (evita "deriva" estando parado)
  gapSeconds: 15, // s: si no hay puntos durante más tiempo, se registra un hueco
  maxRejections: 5, // tras N saltos rechazados seguidos se acepta el punto (el ancla era mala)
};

export class Tracker {
  constructor(opts = {}) {
    this.opts = { ...DEFAULTS, ...opts };
    this.status = 'idle';
    this.segments = []; // [[{lat, lon, t, acc}]]
    this.distance = 0; // metros
    this.gaps = []; // [{t, seconds, meters}]
    this.startedAt = null;
    this.finishedAt = null;
    this.activeMs = 0; // tiempo acumulado midiendo (sin pausas)
    this.resumedAt = null;
    this.rejections = 0;
    this.lastFix = null; // último punto recibido (aunque se descarte), para la UI
  }

  start(now = Date.now()) {
    if (this.status !== 'idle') return;
    this.status = 'running';
    this.startedAt = now;
    this.resumedAt = now;
    this.segments.push([]);
  }

  pause(now = Date.now()) {
    if (this.status !== 'running') return;
    this.activeMs += now - this.resumedAt;
    this.resumedAt = null;
    this.status = 'paused';
  }

  resume(now = Date.now()) {
    if (this.status !== 'paused') return;
    this.status = 'running';
    this.resumedAt = now;
    this.rejections = 0;
    // Nuevo segmento: no se une con el último punto antes de la pausa.
    this.segments.push([]);
  }

  finish(now = Date.now()) {
    if (this.status === 'running') this.pause(now);
    if (this.status !== 'paused') return;
    this.status = 'finished';
    this.finishedAt = now;
    this.segments = this.segments.filter((s) => s.length > 0);
  }

  elapsed(now = Date.now()) {
    return this.activeMs + (this.status === 'running' && this.resumedAt ? now - this.resumedAt : 0);
  }

  /** Todos los puntos aceptados, en orden. */
  points() {
    return this.segments.flat();
  }

  /**
   * Añade un punto GPS {lat, lon, t (ms), acc (m)}.
   * Devuelve 'added' | 'anchor' | 'ignored' | 'inaccurate' | 'jump' | 'still'.
   */
  addPoint(p) {
    this.lastFix = p;
    if (this.status !== 'running') return 'ignored';
    const o = this.opts;
    if (p.acc != null && p.acc > o.maxAccuracy) return 'inaccurate';

    const seg = this.segments[this.segments.length - 1];
    const last = seg[seg.length - 1];
    if (!last) {
      seg.push(p);
      return 'anchor';
    }

    const dt = (p.t - last.t) / 1000;
    if (dt <= 0) return 'ignored';
    const d = haversine(last, p);

    if (d / dt > o.maxSpeed) {
      this.rejections++;
      if (this.rejections < o.maxRejections) return 'jump';
      // Muchos rechazos seguidos: el punto anterior era el malo. Si era el
      // único del segmento se sustituye; si no, se acepta el salto como hueco.
      if (seg.length === 1) {
        seg[0] = p;
        this.rejections = 0;
        return 'anchor';
      }
    }

    // Umbral anti-deriva: no se mueve el ancla, así el avance lento acaba sumando.
    const threshold = Math.max(o.minStep, ((p.acc || 0) + (last.acc || 0)) / 4);
    // Si el GPS dice que estamos parados (velocidad Doppler), se exige además salir del círculo de precisión.
    const stopped = p.speed != null && p.speed >= 0 && p.speed < 0.8 && d < Math.max(threshold, p.acc || 0);
    if (d < threshold || stopped) {
      this.rejections = 0;
      return 'still';
    }

    if (dt > o.gapSeconds) this.gaps.push({ t: p.t, seconds: Math.round(dt), meters: Math.round(d) });
    this.rejections = 0;
    this.distance += d;
    seg.push(p);
    return 'added';
  }

  toJSON() {
    const { opts, status, segments, distance, gaps, startedAt, finishedAt, activeMs, resumedAt } = this;
    return { opts, status, segments, distance, gaps, startedAt, finishedAt, activeMs, resumedAt };
  }

  static fromJSON(data) {
    const t = new Tracker(data.opts);
    Object.assign(t, data, { opts: { ...DEFAULTS, ...data.opts }, rejections: 0, lastFix: null });
    return t;
  }
}
