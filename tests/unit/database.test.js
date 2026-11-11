import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { openDatabase } from '../../src/storage/database.js';
import { importCSV } from '../../src/storage/csv.js';

let db, factory;
beforeEach(async () => { factory = new IDBFactory(); db = await openDatabase({ factory, name: 'pruebas' }); });
afterEach(() => db.close());
describe('Persistencia transaccional en IndexedDB', () => {
  it('crea los ejemplos sólo en la primera carga', async () => { const rows = await db.loadActivities(); expect(rows.map((item) => item.title)).toEqual(['Presentación', 'Preguntas', 'Respuestas', 'Réplica']); expect(await db.loadActivities()).toEqual(rows); });
  it('crea, edita, elimina y ordena registros de forma persistente', async () => {
    const rows = await db.loadActivities();
    rows.push({ id: 'nueva', title: 'Cierre', durationMs: 1000 });
    rows[0].title = 'Título editado'; rows.splice(1, 1); rows.reverse();
    await db.saveActivities(rows); db.close();
    db = await openDatabase({ factory, name: 'pruebas' });
    expect(await db.loadActivities()).toEqual(rows);
  });
  it('mantiene una configuración vacía sin recrear ejemplos', async () => { await db.loadActivities(); await db.saveActivities([]); expect(await db.loadActivities()).toEqual([]); });
  it('no modifica lo anterior si la validación falla', async () => { const previous = await db.loadActivities(); await expect(db.saveActivities([{ title: '', durationMs: 1000 }])).rejects.toThrow(); expect(await db.loadActivities()).toEqual(previous); });
  it('un error CSV conserva íntegra la configuración', async () => { const previous = await db.loadActivities(); try { await db.saveActivities(importCSV('Nueva,01:00\nError,01:99')); } catch { /* Se valida antes de reemplazar. */ } expect(await db.loadActivities()).toEqual(previous); });
  it('rechaza identificadores duplicados', async () => { const row = (await db.loadActivities())[0]; await expect(db.saveActivities([row, row])).rejects.toThrow('repetidos'); });
  it('guarda y recupera la última sesión', async () => { const state = { title: 'Presentación', remainingMs: 9876, state: 'Pausado' }; await db.saveSession(state); expect(await db.loadSession()).toEqual(state); });
  it('asigna generaciones crecientes de autoridad', async () => { expect(await db.nextEpoch()).toBe(1); expect(await db.nextEpoch()).toBe(2); });
  it('informa los errores al abrir el almacenamiento', async () => { await expect(openDatabase({ factory: { open() { const request = {}; queueMicrotask(() => request.onerror()); return request; } } })).rejects.toThrow('almacenamiento local'); });
  it('propaga errores si el almacenamiento deja de estar disponible', async () => { db.close(); await expect(db.saveActivities([{ title: 'Nueva', durationMs: 1000 }])).rejects.toThrow(); });
});
