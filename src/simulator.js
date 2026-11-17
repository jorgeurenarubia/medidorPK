// Simulador de GPS para probar sin salir a la carretera.
// Uso: añadir ?simular=1 a la URL (o ?simular=5 para ir 5 veces más rápido).
// Simula un coche a ~60 km/h por una carretera con curvas, con ruido GPS,
// algún punto impreciso y paradas de vez en cuando.

import { destination } from './geo.js';

export function simulationSpeed() {
  try {
    const v = new URLSearchParams(location.search).get('simular');
    if (v == null) return 0;
    const n = Number(v);
    return n > 0 ? Math.min(n, 50) : 1;
  } catch {
    return 0;
  }
}

export function createSimulatedSource(onPoint, speedFactor = 1) {
  let pos = { lat: 40.3121, lon: -3.9213 }; // una carretera cualquiera cerca de Madrid
  let bearing = 75;
  let t = Date.now();
  let i = 0;

  const timer = setInterval(() => {
    i++;
    t += 1000; // cada punto representa 1 s de conducción
    const stopped = i % 90 > 80; // para 10 s cada 90 s (semáforo, cruce…)
    const speed = stopped ? 0 : 16.7; // m/s ≈ 60 km/h
    bearing += Math.sin(i / 25) * 4; // curvas suaves
    if (speed) pos = destination(pos, speed, bearing);

    const bad = i % 37 === 0; // de vez en cuando un punto malo
    const noise = destination(pos, Math.random() * (bad ? 60 : 3), Math.random() * 360);
    onPoint({ ...noise, t, acc: bad ? 65 : 4 + Math.random() * 4, speed });
  }, 1000 / speedFactor);

  return async () => clearInterval(timer);
}
