// Almacenamiento local (IndexedDB) en el propio móvil.
//  - "tramos": mediciones terminadas
//  - "estado": la medición en curso, para recuperarla si la app se cierra

import { openDB } from 'idb';

const dbPromise = openDB('medidorpk', 1, {
  upgrade(db) {
    const tramos = db.createObjectStore('tramos', { keyPath: 'id' });
    tramos.createIndex('startedAt', 'startedAt');
    db.createObjectStore('estado');
  },
});

export async function saveTramo(tramo) {
  const db = await dbPromise;
  await db.put('tramos', tramo);
  return tramo;
}

export async function getTramo(id) {
  return (await dbPromise).get('tramos', id);
}

/** Todos los tramos, del más reciente al más antiguo. */
export async function listTramos() {
  const all = await (await dbPromise).getAllFromIndex('tramos', 'startedAt');
  return all.reverse();
}

export async function deleteTramo(id) {
  return (await dbPromise).delete('tramos', id);
}

export async function saveCurrent(data) {
  return (await dbPromise).put('estado', data, 'actual');
}

export async function loadCurrent() {
  return (await dbPromise).get('estado', 'actual');
}

export async function clearCurrent() {
  return (await dbPromise).delete('estado', 'actual');
}

/** Pide al navegador que no borre los datos (Safari puede limpiar webs sin uso). */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    /* no soportado */
  }
}

export function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
