// Puntos kilométricos (PK). Internamente se guardan en metros.

/**
 * Convierte texto a metros. Acepta:
 *  "12+350" → 12350   "12+35" → 12035   "12" → 12000
 *  "12,350" o "12.35" → kilómetros con decimales → 12350
 * Devuelve null si no es válido o está vacío.
 */
export function parsePk(text) {
  if (text == null) return null;
  const t = String(text).trim().replace(/\s+/g, '');
  if (!t) return null;

  const plus = t.match(/^(\d+)\+(\d{1,3})$/);
  if (plus) return Number(plus[1]) * 1000 + Number(plus[2]);

  const dec = t.match(/^(\d+)(?:[.,](\d+))?$/);
  if (dec) return Math.round(Number(`${dec[1]}.${dec[2] || '0'}`) * 1000);

  return null;
}

/** 12350 → "12+350" */
export function formatPk(meters) {
  if (meters == null || Number.isNaN(meters)) return '—';
  const m = Math.round(meters);
  const sign = m < 0 ? '-' : '';
  const abs = Math.abs(m);
  return `${sign}${Math.floor(abs / 1000)}+${String(abs % 1000).padStart(3, '0')}`;
}

/**
 * PK final a partir del inicial, la distancia recorrida y el sentido
 * (+1 = PK creciente, -1 = PK decreciente).
 */
export function endPk(startMeters, distanceMeters, direction = 1) {
  if (startMeters == null) return null;
  return Math.round(startMeters + (direction < 0 ? -1 : 1) * distanceMeters);
}
