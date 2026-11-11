import { describe, it, expect } from 'vitest';
import { loadMode, saveMode } from '../../src/storage/preferences.js';

describe('Preferencia global independiente de actividades y CSV', () => {
  const storage = () => { const data = new Map(); return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }; };
  it('instalaciones anteriores usan countdown y el guardado es síncrono', () => {
    const local = storage(); expect(loadMode(local, '/')).toBe('countdown');
    saveMode(local, '/', 'countup'); expect(loadMode(local, '/')).toBe('countup');
    saveMode(local, '/', 'countdown'); expect(loadMode(local, '/')).toBe('countdown');
  });
  it('separa rutas y normaliza datos desconocidos', () => {
    const local = storage(); saveMode(local, '/evento/', 'countup');
    expect(loadMode(local, '/otro/')).toBe('countdown'); saveMode(local, '/evento/', 'invalido');
    expect(loadMode(local, '/evento/')).toBe('countdown');
  });
  it('propaga errores de almacenamiento para que la UI los informe', () => {
    const local = { getItem() { throw new Error('Sin permiso'); }, setItem() { throw new Error('Cuota'); } };
    expect(() => loadMode(local, '/')).toThrow('Sin permiso'); expect(() => saveMode(local, '/', 'countup')).toThrow('Cuota');
  });
});
