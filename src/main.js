import './style.css';
import { Tracker } from './tracker.js';
import { formatKm, formatMeters, formatDuration } from './geo.js';
import { formatPk, endPk } from './pk.js';
import { watchLocation, isNative } from './location-source.js';
import { keepScreenOn, wakeLockSupported } from './wakelock.js';
import * as store from './storage.js';
import { summaryText, toGpx, toCsv, share, tramoTitle, safeFileName } from './export.js';
import { simulationSpeed } from './simulator.js';

const app = document.getElementById('app');
const tabs = document.getElementById('tabs');
const toastEl = document.getElementById('toast');

// ---------- estado ----------
let tracker = null; // medición en curso (Tracker)
let meta = null; // {road, note, pkStart, direction}
let stopWatch = null; // para parar el GPS
let gpsError = null;
let uiTimer = null;
let lastSave = 0;
let view = { name: 'medir' };
let destroyMap = null;
let tramosCache = []; // tramos cargados (para compartir sin "await" previo)

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// ---------- utilidades ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const $ = (sel) => app.querySelector(sel);
const fmtDate = (ms) => new Date(ms).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

function prefs() {
  try {
    return JSON.parse(localStorage.getItem('medidorpk.prefs')) || {};
  } catch {
    return {};
  }
}
function savePrefs(p) {
  try {
    localStorage.setItem('medidorpk.prefs', JSON.stringify({ ...prefs(), ...p }));
  } catch {
    /* sin almacenamiento */
  }
}

function pkFromFields(kmEl, mEl) {
  const km = kmEl.value.trim();
  const m = mEl.value.trim();
  if (!km && !m) return null;
  return (Number(km) || 0) * 1000 + Math.min(999, Number(m) || 0);
}

function pkFields(prefix, meters) {
  const km = meters == null ? '' : Math.floor(meters / 1000);
  const m = meters == null ? '' : String(Math.round(meters) % 1000).padStart(3, '0');
  return `
    <div class="pk-input">
      <input id="${prefix}-km" inputmode="numeric" pattern="[0-9]*" placeholder="km" value="${km}" aria-label="PK kilómetro" />
      <span>+</span>
      <input id="${prefix}-m" inputmode="numeric" pattern="[0-9]*" maxlength="3" placeholder="000" value="${m}" aria-label="PK metros" />
    </div>`;
}

function directionToggle(dir) {
  return `
    <div class="seg" role="radiogroup" aria-label="Sentido del PK">
      <button type="button" data-dir="1" class="${dir >= 0 ? 'on' : ''}">PK ↑ creciente</button>
      <button type="button" data-dir="-1" class="${dir < 0 ? 'on' : ''}">PK ↓ decreciente</button>
    </div>`;
}

function bindDirectionToggle(onChange) {
  app.querySelectorAll('[data-dir]').forEach((b) =>
    b.addEventListener('click', () => {
      app.querySelectorAll('[data-dir]').forEach((x) => x.classList.toggle('on', x === b));
      onChange(Number(b.dataset.dir));
    })
  );
}

// ---------- navegación ----------
function go(name, params = {}) {
  if (destroyMap) {
    destroyMap();
    destroyMap = null;
  }
  view = { name, ...params };
  tabs.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === (name === 'detalle' ? 'historial' : name)));
  window.scrollTo(0, 0);
  if (name === 'medir') renderMedir();
  else if (name === 'historial') renderHistorial();
  else if (name === 'detalle') renderDetalle(params.id);
}

tabs.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]');
  if (t) go(t.dataset.tab);
});

// ---------- pantalla MEDIR ----------
function renderMedir() {
  if (tracker && (tracker.status === 'running' || tracker.status === 'paused')) return renderMidiendo();

  const p = prefs();
  let direction = p.direction ?? 1;
  const installHint =
    isIOS && !isStandalone && !isNative
      ? `<div class="banner">Para instalarla en el iPhone: pulsa <b>Compartir</b> <span class="ios-share">⬆︎</span> y luego <b>"Añadir a pantalla de inicio"</b>.</div>`
      : '';
  const simHint = simulationSpeed() ? `<div class="banner warn">Modo simulación (GPS falso ×${simulationSpeed()})</div>` : '';

  app.innerHTML = `
    <header class="top"><h1>medidor<span>PK</span></h1></header>
    ${installHint}${simHint}
    <section class="card form">
      <label>Carretera / tramo <span class="opt">(opcional)</span>
        <input id="road" placeholder="Ej: M-501" value="${esc(p.road || '')}" autocomplete="off" />
      </label>
      <label>PK inicial <span class="opt">(opcional)</span></label>
      ${pkFields('pk', null)}
      ${directionToggle(direction)}
      <label>Nota <span class="opt">(opcional)</span>
        <input id="note" placeholder="Ej: bacheo margen derecho" autocomplete="off" />
      </label>
    </section>
    <button id="start" class="big go">INICIAR</button>
    <p class="hint">Pulsa al empezar el tramo y "Terminar" al acabar. ${isNative ? '' : 'Deja la app abierta y la pantalla encendida mientras mides.'}</p>
  `;
  bindDirectionToggle((d) => (direction = d));
  $('#start').addEventListener('click', () => {
    const road = $('#road').value.trim();
    savePrefs({ road, direction });
    startMeasuring({
      road,
      note: $('#note').value.trim(),
      pkStart: pkFromFields($('#pk-km'), $('#pk-m')),
      direction,
    });
  });
}

async function startMeasuring(m) {
  meta = m;
  tracker = new Tracker();
  tracker.start();
  gpsError = null;
  await persistCurrent(true);
  await startGps();
  keepScreenOn(true);
  store.requestPersistence();
  renderMidiendo();
}

async function startGps() {
  if (stopWatch) await stopGps();
  try {
    stopWatch = await watchLocation(onPoint, (err) => {
      gpsError = err;
      updateMidiendo();
    });
  } catch (e) {
    gpsError = { code: 'UNKNOWN', message: e.message || 'No se pudo iniciar el GPS' };
  }
}

async function stopGps() {
  const s = stopWatch;
  stopWatch = null;
  try {
    await s?.();
  } catch {
    /* ya parado */
  }
}

function onPoint(p) {
  if (!tracker) return;
  gpsError = null;
  tracker.addPoint(p);
  updateMidiendo();
  if (Date.now() - lastSave > 5000) persistCurrent();
}

async function persistCurrent(force = false) {
  if (!tracker) return;
  lastSave = Date.now();
  try {
    await store.saveCurrent({ tracker: tracker.toJSON(), meta });
  } catch (e) {
    if (force) console.error(e);
  }
}

function renderMidiendo() {
  const paused = tracker.status === 'paused';
  const showWakeHint = !isNative && !wakeLockSupported;
  app.innerHTML = `
    <header class="top row">
      <h1>medidor<span>PK</span></h1>
      <div id="gps" class="chip">GPS…</div>
    </header>
    ${showWakeHint ? `<div class="banner warn">Este iPhone no puede mantener la pantalla encendida solo. Pon <b>Ajustes → Pantalla → Bloqueo automático → Nunca</b> mientras mides.</div>` : ''}
    <section class="meter ${paused ? 'paused' : ''}">
      <div class="state">${paused ? 'EN PAUSA' : 'MIDIENDO'}${meta.road ? ` · ${esc(meta.road)}` : ''}</div>
      <div class="km"><span id="km">0,000</span><small>km</small></div>
      <div class="m"><span id="m">0</span> m</div>
      ${meta.pkStart != null ? `<div class="pk-live">PK actual <b id="pk">${formatPk(meta.pkStart)}</b><span class="from">desde ${formatPk(meta.pkStart)} ${meta.direction < 0 ? '↓' : '↑'}</span></div>` : ''}
      <div class="stats">
        <div><small>Tiempo</small><b id="time">0:00</b></div>
        <div><small>Velocidad</small><b id="speed">—</b></div>
      </div>
      <div id="gap" class="gap-note"></div>
    </section>
    <div class="actions">
      ${paused ? `<button id="resume" class="big go">REANUDAR</button>` : `<button id="pause" class="big pause">PAUSAR</button>`}
      <button id="finish" class="big stop">TERMINAR</button>
      ${paused ? `<button id="discard" class="link danger">Descartar esta medición</button>` : ''}
    </div>
  `;
  $('#pause')?.addEventListener('click', () => {
    tracker.pause();
    persistCurrent();
    renderMidiendo();
  });
  $('#resume')?.addEventListener('click', () => {
    tracker.resume();
    persistCurrent();
    renderMidiendo();
  });
  $('#finish').addEventListener('click', finishMeasuring);
  $('#discard')?.addEventListener('click', async () => {
    if (!confirm('¿Descartar esta medición? No se guardará.')) return;
    await endSession();
    toast('Medición descartada');
    go('medir');
  });
  updateMidiendo();
  clearInterval(uiTimer);
  uiTimer = setInterval(updateMidiendo, 1000);
}

function updateMidiendo() {
  if (!tracker || view.name !== 'medir') return;
  const kmEl = $('#km');
  if (!kmEl) return;
  const d = tracker.distance;
  kmEl.textContent = formatKm(d);
  $('#m').textContent = formatMeters(d);
  const pkEl = $('#pk');
  if (pkEl) pkEl.textContent = formatPk(endPk(meta.pkStart, d, meta.direction));
  $('#time').textContent = formatDuration(tracker.elapsed());

  const fix = tracker.lastFix;
  const speedEl = $('#speed');
  if (fix?.speed != null && fix.speed >= 0) speedEl.textContent = `${Math.round(fix.speed * 3.6)} km/h`;
  else speedEl.textContent = '—';

  const gps = $('#gps');
  const age = fix ? (Date.now() - fix.t) / 1000 : null;
  let cls = 'warn';
  let txt = 'Buscando GPS…';
  if (gpsError && gpsError.code !== 'TIMEOUT') {
    cls = 'bad';
    txt = gpsError.message;
  } else if (fix && age > 10 && !simulationSpeed()) {
    cls = 'bad';
    txt = `Sin señal (${Math.round(age)} s)`;
  } else if (fix) {
    const acc = Math.round(fix.acc ?? 0);
    cls = acc <= 25 ? 'ok' : 'warn';
    txt = acc <= 25 ? `GPS ±${acc} m` : `GPS débil ±${acc} m`;
  }
  gps.className = `chip ${cls}`;
  gps.textContent = txt;

  const gaps = tracker.gaps;
  $('#gap').textContent = gaps.length
    ? `⚠ ${gaps.length} corte${gaps.length > 1 ? 's' : ''} de señal: ese trozo se ha estimado en línea recta.`
    : '';
}

async function finishMeasuring() {
  if (!confirm('¿Terminar y guardar la medición?')) return;
  tracker.finish();
  const tramo = {
    id: store.newId(),
    road: meta.road,
    note: meta.note,
    pkStart: meta.pkStart,
    direction: meta.direction,
    distance: tracker.distance,
    startedAt: tracker.startedAt,
    finishedAt: tracker.finishedAt,
    activeMs: tracker.activeMs,
    segments: tracker.segments,
    gaps: tracker.gaps,
  };
  await store.saveTramo(tramo);
  await endSession();
  toast(`Guardado: ${formatMeters(tramo.distance)} m`);
  go('detalle', { id: tramo.id });
}

async function endSession() {
  clearInterval(uiTimer);
  await stopGps();
  keepScreenOn(false);
  tracker = null;
  meta = null;
  await store.clearCurrent();
}

// ---------- pantalla HISTORIAL ----------
async function renderHistorial() {
  tramosCache = await store.listTramos();
  if (view.name !== 'historial') return;
  const total = tramosCache.reduce((s, t) => s + t.distance, 0);
  app.innerHTML = `
    <header class="top row"><h1>Historial</h1>
      ${tramosCache.length ? `<button id="csv-all" class="small">Exportar CSV</button>` : ''}
    </header>
    ${
      tramosCache.length
        ? `<p class="hint">${tramosCache.length} tramo${tramosCache.length > 1 ? 's' : ''} · ${formatKm(total, 2)} km en total</p>
           <ul class="list">${tramosCache
             .map(
               (t) => `
            <li><button data-id="${t.id}" class="item">
              <div class="item-main">
                <b>${esc(tramoTitle(t))}</b>
                <small>${fmtDate(t.startedAt)}${t.pkStart != null ? ` · PK ${formatPk(t.pkStart)} → ${formatPk(endPk(t.pkStart, t.distance, t.direction))}` : ''}</small>
                ${t.note ? `<small class="note">${esc(t.note)}</small>` : ''}
              </div>
              <div class="item-dist">${formatKm(t.distance)}<small>km</small></div>
            </button></li>`
             )
             .join('')}</ul>`
        : `<div class="empty">Aún no hay tramos medidos.<br>Ve a <b>Medir</b> y pulsa <b>Iniciar</b>.</div>`
    }
  `;
  app.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => go('detalle', { id: b.dataset.id })));
  $('#csv-all')?.addEventListener('click', () => shareResult(share({
    title: 'Tramos medidorPK',
    file: { name: `medidorPK_${new Date().toISOString().slice(0, 10)}.csv`, content: toCsv(tramosCache), mime: 'text/csv' },
  })));
}

async function shareResult(promise) {
  try {
    const r = await promise;
    if (r === 'copied') toast('Copiado al portapapeles');
    else if (r === 'downloaded') toast('Archivo descargado');
    else if (r === 'unsupported') toast('No se puede compartir en este navegador');
  } catch (e) {
    toast('No se pudo compartir');
    console.error(e);
  }
}

// ---------- pantalla DETALLE ----------
async function renderDetalle(id) {
  const t = tramosCache.find((x) => x.id === id) || (await store.getTramo(id));
  if (!t) return go('historial');
  if (!tramosCache.includes(t)) tramosCache.push(t);
  let direction = t.direction ?? 1;
  const hasPk = t.pkStart != null;
  const gapSecs = (t.gaps || []).reduce((s, g) => s + g.seconds, 0);

  app.innerHTML = `
    <header class="top row">
      <button id="back" class="small ghost">‹ Historial</button>
    </header>
    <h2 class="title">${esc(tramoTitle(t))}</h2>
    <p class="hint">${fmtDate(t.startedAt)} · ${formatDuration(t.activeMs)} midiendo${t.note ? `<br><i>${esc(t.note)}</i>` : ''}</p>
    <div id="map" class="map"></div>
    <section class="card result">
      <div class="km"><span>${formatKm(t.distance)}</span><small>km</small></div>
      <div class="m">${formatMeters(t.distance)} m</div>
      ${hasPk ? `<div class="pk-range">PK <b>${formatPk(t.pkStart)}</b> → <b>${formatPk(endPk(t.pkStart, t.distance, direction))}</b> <span>${direction < 0 ? 'decreciente' : 'creciente'}</span></div>` : ''}
      ${t.gaps?.length ? `<p class="gap-note">⚠ ${t.gaps.length} corte${t.gaps.length > 1 ? 's' : ''} de señal (${gapSecs} s): estimado en línea recta.</p>` : ''}
    </section>
    <div class="share-row">
      <button id="share-text" class="mid">Compartir</button>
      <button id="share-gpx" class="mid alt">GPX</button>
      <button id="share-csv" class="mid alt">CSV</button>
    </div>
    <details class="card form edit">
      <summary>Editar datos</summary>
      <label>Carretera / tramo <input id="road" value="${esc(t.road || '')}" autocomplete="off" /></label>
      <label>PK inicial</label>
      ${pkFields('pk', t.pkStart)}
      ${directionToggle(direction)}
      <label>Nota <input id="note" value="${esc(t.note || '')}" autocomplete="off" /></label>
      <button id="save" class="mid">Guardar cambios</button>
    </details>
    <button id="delete" class="link danger">Borrar este tramo</button>
  `;

  destroyMap = (await import('./map.js')).renderTrackMap($('#map'), t.segments);

  $('#back').addEventListener('click', () => go('historial'));
  bindDirectionToggle((d) => (direction = d));
  $('#save').addEventListener('click', async () => {
    t.road = $('#road').value.trim();
    t.note = $('#note').value.trim();
    t.pkStart = pkFromFields($('#pk-km'), $('#pk-m'));
    t.direction = direction;
    await store.saveTramo(t);
    toast('Cambios guardados');
    go('detalle', { id: t.id });
  });
  $('#delete').addEventListener('click', async () => {
    if (!confirm('¿Borrar este tramo? No se puede deshacer.')) return;
    await store.deleteTramo(t.id);
    tramosCache = tramosCache.filter((x) => x !== t);
    toast('Tramo borrado');
    go('historial');
  });
  const base = safeFileName(`${tramoTitle(t)}_${new Date(t.startedAt).toISOString().slice(0, 10)}`);
  $('#share-text').addEventListener('click', () => shareResult(share({ title: tramoTitle(t), text: summaryText(t) })));
  $('#share-gpx').addEventListener('click', () =>
    shareResult(share({ title: tramoTitle(t), file: { name: `${base}.gpx`, content: toGpx(t), mime: 'application/gpx+xml' } }))
  );
  $('#share-csv').addEventListener('click', () =>
    shareResult(share({ title: tramoTitle(t), file: { name: `${base}.csv`, content: toCsv([t]), mime: 'text/csv' } }))
  );
}

// ---------- ciclo de vida ----------
document.addEventListener('visibilitychange', () => {
  if (!tracker) return;
  if (document.visibilityState === 'hidden') {
    persistCurrent();
  } else if (!isNative && tracker.status !== 'finished') {
    // iOS puede dejar de entregar posiciones tras volver del segundo plano: se reinicia el GPS.
    startGps();
  }
});
window.addEventListener('pagehide', () => persistCurrent());

async function setupNative() {
  if (!isNative) return;
  const { App } = await import('@capacitor/app');
  App.addListener('backButton', () => {
    if (view.name === 'detalle') go('historial');
    else if (view.name === 'historial') go('medir');
    else if (tracker) App.minimizeApp(); // midiendo: no cerrar, solo minimizar
    else App.exitApp();
  });
}

async function init() {
  setupNative();
  try {
    const saved = await store.loadCurrent();
    if (saved?.tracker && (saved.tracker.status === 'running' || saved.tracker.status === 'paused')) {
      tracker = Tracker.fromJSON(saved.tracker);
      meta = saved.meta;
      await startGps();
      keepScreenOn(true);
      toast('Medición recuperada');
    }
  } catch (e) {
    console.error(e);
  }
  go('medir');
}

init();
