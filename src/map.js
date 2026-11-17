// Mapa del recorrido con Leaflet + OpenStreetMap.

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/** Dibuja el tramo en `el`. Devuelve una función para destruir el mapa. */
export function renderTrackMap(el, segments) {
  const segs = segments.filter((s) => s.length);
  const map = L.map(el, { zoomControl: true, attributionControl: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  if (!segs.length) {
    map.setView([40.4168, -3.7038], 6);
    return () => map.remove();
  }

  const latlngs = segs.map((s) => s.map((p) => [p.lat, p.lon]));
  const line = L.polyline(latlngs, { color: '#ff6a00', weight: 6, opacity: 0.9 }).addTo(map);

  const first = latlngs[0][0];
  const lastSeg = latlngs[latlngs.length - 1];
  const last = lastSeg[lastSeg.length - 1];
  L.circleMarker(first, { radius: 9, color: '#fff', weight: 3, fillColor: '#16a34a', fillOpacity: 1 })
    .bindTooltip('Inicio')
    .addTo(map);
  L.circleMarker(last, { radius: 9, color: '#fff', weight: 3, fillColor: '#dc2626', fillOpacity: 1 })
    .bindTooltip('Fin')
    .addTo(map);

  map.fitBounds(line.getBounds(), { padding: [24, 24], maxZoom: 17 });
  // Leaflet calcula mal el tamaño si el contenedor acaba de aparecer.
  setTimeout(() => map.invalidateSize(), 50);
  return () => map.remove();
}
