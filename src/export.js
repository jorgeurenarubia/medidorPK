// Exportar y compartir: resumen de texto (WhatsApp/email), GPX del recorrido, CSV del historial.

import { formatKm, formatMeters, formatDuration } from './geo.js';
import { formatPk, endPk } from './pk.js';

const fmtDate = (ms) =>
  new Date(ms).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });

const firstPoint = (tr) => tr.segments.find((s) => s.length)?.[0];
const lastPoint = (tr) => {
  const segs = tr.segments.filter((s) => s.length);
  const s = segs[segs.length - 1];
  return s?.[s.length - 1];
};

const coords = (p) => (p ? `${p.lat.toFixed(6)},${p.lon.toFixed(6)}` : '');

export function tramoTitle(tr) {
  return tr.road?.trim() || 'Tramo sin nombre';
}

export function summaryText(tr) {
  const lines = [`📏 ${tramoTitle(tr)}`, `Fecha: ${fmtDate(tr.startedAt)}`];
  lines.push(`Distancia: ${formatKm(tr.distance)} km (${formatMeters(tr.distance)} m)`);
  if (tr.pkStart != null) {
    lines.push(
      `PK: ${formatPk(tr.pkStart)} → ${formatPk(endPk(tr.pkStart, tr.distance, tr.direction))} (${tr.direction < 0 ? 'decreciente' : 'creciente'})`
    );
  }
  lines.push(`Duración: ${formatDuration(tr.activeMs)}`);
  if (tr.note?.trim()) lines.push(`Nota: ${tr.note.trim()}`);
  const a = firstPoint(tr);
  const b = lastPoint(tr);
  if (a) lines.push(`Inicio: https://maps.google.com/?q=${coords(a)}`);
  if (b) lines.push(`Fin: https://maps.google.com/?q=${coords(b)}`);
  return lines.join('\n');
}

const xml = (s) =>
  String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);

export function toGpx(tr) {
  const segs = tr.segments
    .filter((s) => s.length)
    .map(
      (s) =>
        `    <trkseg>\n${s
          .map((p) => `      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}"><time>${new Date(p.t).toISOString()}</time></trkpt>`)
          .join('\n')}\n    </trkseg>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="medidorPK" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${xml(tramoTitle(tr))}</name><time>${new Date(tr.startedAt).toISOString()}</time></metadata>
  <trk>
    <name>${xml(tramoTitle(tr))}</name>
    <desc>${xml(`${formatMeters(tr.distance)} m${tr.note ? ' — ' + tr.note : ''}`)}</desc>
${segs}
  </trk>
</gpx>
`;
}

/** CSV para Excel en español: separador ';', decimales con coma, BOM UTF-8. */
export function toCsv(tramos) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['Fecha', 'Carretera', 'PK inicio', 'PK fin', 'Sentido', 'Distancia (m)', 'Distancia (km)', 'Duración', 'Nota', 'Inicio (lat,lon)', 'Fin (lat,lon)'];
  const rows = tramos.map((tr) => {
    const hasPk = tr.pkStart != null;
    return [
      fmtDate(tr.startedAt),
      tr.road || '',
      hasPk ? formatPk(tr.pkStart) : '',
      hasPk ? formatPk(endPk(tr.pkStart, tr.distance, tr.direction)) : '',
      hasPk ? (tr.direction < 0 ? 'decreciente' : 'creciente') : '',
      Math.round(tr.distance),
      formatKm(tr.distance),
      formatDuration(tr.activeMs),
      tr.note || '',
      coords(firstPoint(tr)),
      coords(lastPoint(tr)),
    ].map(q).join(';');
  });
  return '﻿' + [header.map(q).join(';'), ...rows].join('\r\n');
}

export function safeFileName(s) {
  return (s || 'tramo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(0, 60);
}

/**
 * Comparte texto y/o un archivo con el menú del sistema (WhatsApp, Mail, Archivos…).
 * file = {name, content, mime}. En el navegador se llama sin "await" previos para
 * no perder el gesto del usuario (requisito de Safari).
 */
export async function share({ title, text, file }) {
  if (file) {
    const f = new File([file.content], file.name, { type: file.mime });
    if (navigator.canShare?.({ files: [f] })) {
      try {
        await navigator.share({ files: [f], title });
        return 'shared';
      } catch (e) {
        if (e.name === 'AbortError') return 'cancelled';
      }
    }
    download(f);
    return 'downloaded';
  }

  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'unsupported';
  }
}

function download(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
