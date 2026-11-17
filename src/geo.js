// Utilidades geográficas puras (sin dependencias del navegador).

const R = 6371008.8; // radio medio de la Tierra en metros

const toRad = (deg) => (deg * Math.PI) / 180;

/** Distancia en metros entre dos puntos {lat, lon} (fórmula de haversine). */
export function haversine(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Longitud total en metros de una lista de puntos. */
export function pathLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversine(points[i - 1], points[i]);
  return total;
}

/** Punto destino a `meters` metros desde `p` con rumbo `bearingDeg` (para simulador/tests). */
export function destination(p, meters, bearingDeg) {
  const d = meters / R;
  const brg = toRad(bearingDeg);
  const lat1 = toRad(p.lat);
  const lon1 = toRad(p.lon);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brg)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brg) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );
  return { lat: (lat2 * 180) / Math.PI, lon: (lon2 * 180) / Math.PI };
}

/** "1,245 km" */
export function formatKm(meters, decimals = 3) {
  return (meters / 1000).toLocaleString('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** "1.245 m" */
export function formatMeters(meters) {
  return Math.round(meters).toLocaleString('es-ES', { useGrouping: true });
}

/** "1:02:05" o "12:05" */
export function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
