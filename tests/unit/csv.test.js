import { describe, it, expect } from 'vitest';
import { importCSV, exportCSV } from '../../src/storage/csv.js';

describe('CSV UTF-8 sin encabezados', () => {
  it('importa ejemplos y conserva el orden', () => { expect(importCSV('Presentación,10:00\r\nPreguntas,05:00\r\n').map((row) => row.title)).toEqual(['Presentación', 'Preguntas']); });
  it('admite BOM y acentos', () => expect(importCSV('\uFEFFRéplica,03:00')[0]).toMatchObject({ title: 'Réplica', durationMs: 180000 }));
  it('exporta sin encabezado y con CRLF', () => expect(exportCSV([{ title: 'Presentación', durationMs: 600000 }])).toBe('Presentación,10:00\r\n'));
  it('escapa comas, comillas y saltos de línea sin perder información', () => {
    const rows = ['Exposición, debate', 'Réplica "final"', 'Preguntas\ny respuestas'].map((title) => ({ title, durationMs: 60000 }));
    const csv = exportCSV(rows);
    expect(csv).toContain('"Réplica ""final""",01:00');
    expect(importCSV(csv).map(({ title, durationMs }) => ({ title, durationMs }))).toEqual(rows);
  });
  it.each(['', '\uFEFF', '   ', 'A,00:00', 'A,10:60', 'A,01:00,extra', 'A', 'A,01:00\n\n', '"sin cerrar,01:00', 'A"a,01:00', '"A"texto,01:00', ' ,01:00', 'Título,Duración'])('rechaza el archivo inválido %j de forma completa', (csv) => expect(() => importCSV(csv)).toThrow());
  it('no devuelve resultados parciales ante una fila inválida', () => expect(() => importCSV('Válida,01:00\nInválida,00:99')).toThrow('Registro 2'));
  it('permite minutos mayores a 59', () => expect(importCSV('Debate,120:00')[0].durationMs).toBe(7200000));
});
