// Fuente de posiciones GPS. Misma interfaz para:
//  - PWA (navegador): navigator.geolocation.watchPosition
//  - APK (Android nativo): plugin de geolocalización en segundo plano (sigue con pantalla apagada)
//  - Simulador: ?simular=1 en la URL

import { Capacitor, registerPlugin } from '@capacitor/core';
import { createSimulatedSource, simulationSpeed } from './simulator.js';

export const isNative = Capacitor.isNativePlatform();

const BackgroundGeolocation = isNative ? registerPlugin('BackgroundGeolocation') : null;

/**
 * Empieza a recibir posiciones. onPoint({lat, lon, t, acc, speed}), onError({code, message}).
 * Devuelve una función async para parar.
 */
export async function watchLocation(onPoint, onError) {
  const sim = simulationSpeed();
  if (sim) return createSimulatedSource(onPoint, sim);
  if (isNative) return watchNative(onPoint, onError);
  return watchBrowser(onPoint, onError);
}

function watchBrowser(onPoint, onError) {
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

async function watchNative(onPoint, onError) {
  const id = await BackgroundGeolocation.addWatcher(
    {
      backgroundTitle: 'medidorPK está midiendo',
      backgroundMessage: 'Midiendo el tramo. Abre la app para pausar o terminar.',
      requestPermissions: true,
      stale: false,
      distanceFilter: 0,
    },
    (loc, err) => {
      if (err) {
        if (err.code === 'NOT_AUTHORIZED') {
          onError({ code: 'NOT_AUTHORIZED', message: 'Permiso de ubicación denegado.' });
          if (window.confirm('medidorPK necesita tu ubicación. ¿Abrir los ajustes?')) {
            BackgroundGeolocation.openSettings();
          }
        } else {
          onError({ code: err.code || 'UNKNOWN', message: err.message || 'Error de GPS' });
        }
        return;
      }
      if (!loc) return;
      onPoint({
        lat: loc.latitude,
        lon: loc.longitude,
        t: loc.time || Date.now(),
        acc: loc.accuracy,
        speed: loc.speed,
      });
    }
  );
  return async () => BackgroundGeolocation.removeWatcher({ id });
}
