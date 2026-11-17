// Fuente de posiciones GPS:
//  - Navegador / PWA: navigator.geolocation.watchPosition
//  - Simulador: ?simular=1 en la URL

import { createSimulatedSource, simulationSpeed } from './simulator.js';

/**
 * Empieza a recibir posiciones. onPoint({lat, lon, t, acc, speed}), onError({code, message}).
 * Devuelve una función async para parar.
 */
export async function watchLocation(onPoint, onError) {
  const sim = simulationSpeed();
  if (sim) return createSimulatedSource(onPoint, sim);

  if (!('geolocation' in navigator)) {
    onError({ code: 'UNSUPPORTED', message: 'Este navegador no tiene GPS.' });
    return async () => {};
  }
  const id = navigator.geolocation.watchPosition(
    (pos) =>
      onPoint({
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        t: pos.timestamp || Date.now(),
        acc: pos.coords.accuracy,
        speed: pos.coords.speed,
      }),
    (err) => {
      const map = {
        1: ['NOT_AUTHORIZED', 'Permiso de ubicación denegado. Actívalo en Ajustes → Privacidad → Localización.'],
        2: ['UNAVAILABLE', 'Sin señal GPS.'],
        3: ['TIMEOUT', 'Buscando señal GPS…'],
      };
      const [code, message] = map[err.code] || ['UNKNOWN', err.message];
      onError({ code, message });
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
  );
  return async () => navigator.geolocation.clearWatch(id);
}
