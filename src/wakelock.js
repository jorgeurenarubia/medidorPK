// Mantiene la pantalla encendida mientras se mide (iPhone: imprescindible,
// porque iOS no da GPS a una PWA con la pantalla bloqueada).

let sentinel = null;
let wanted = false;

export const wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

async function acquire() {
  if (!wakeLockSupported || !wanted || document.visibilityState !== 'visible') return;
  try {
    if (sentinel && !sentinel.released) return;
    sentinel = await navigator.wakeLock.request('screen');
  } catch {
    sentinel = null;
  }
}

export async function keepScreenOn(on) {
  wanted = on;
  if (on) return acquire();
  try {
    await sentinel?.release();
  } catch {
    /* ya liberado */
  }
  sentinel = null;
}

export function isScreenLockActive() {
  return !!sentinel && !sentinel.released;
}

// El sistema libera el bloqueo al cambiar de app; se vuelve a pedir al volver.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', acquire);
}
