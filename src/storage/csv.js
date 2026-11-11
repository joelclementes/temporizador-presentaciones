import { formatDuration, parseDuration, validateActivity } from '../core/activity.js';

// CSV estricto: comillas dobles escapadas, CRLF/LF y saltos dentro de campos citados.
export function importCSV(input) {
  if (typeof input !== 'string' || !input.replace(/^\uFEFF/, '').trim()) throw new Error('El archivo CSV está vacío.');
  const source = input.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], field = '', quoted = false, closed = false;
  const pushField = () => { row.push(field); field = ''; closed = false; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') { field += '"'; i += 1; }
        else { quoted = false; closed = true; }
      } else field += char;
    } else if (char === '"') {
      if (field || closed) throw new Error('CSV mal formado: comillas fuera del inicio de un campo.');
      quoted = true;
    } else if (char === ',') pushField();
    else if (char === '\r' || char === '\n') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      pushRow();
    } else {
      if (closed) throw new Error('CSV mal formado: hay texto después del cierre de comillas.');
      field += char;
    }
  }
  if (quoted) throw new Error('CSV mal formado: falta cerrar un campo entre comillas.');
  if (field || closed || row.length) pushRow();
  return rows.map((cells, index) => {
    try {
      if (cells.length !== 2) throw new Error('Cada registro debe tener exactamente dos campos: título y duración.');
      return validateActivity({ title: cells[0], durationMs: parseDuration(cells[1]) });
    } catch (error) { throw new Error(`Registro ${index + 1}: ${error.message}`); }
  });
}

export function exportCSV(activities) {
  const escape = (value) => /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  return activities.map(validateActivity).map((item) => `${escape(item.title)},${formatDuration(item.durationMs)}`).join('\r\n') + (activities.length ? '\r\n' : '');
}
