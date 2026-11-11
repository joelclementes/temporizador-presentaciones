import { describe, it, expect, beforeEach } from 'vitest';
import { TimerEngine } from '../../src/core/timer-engine.js';
import { parseDuration, formatDuration, validateActivity } from '../../src/core/activity.js';
import { STATES, TRANSITIONS } from '../../src/core/timer-state.js';

let now, engine, sequence;
const activity = { id: 'a', title: 'Presentación', durationMs: 600000 };
beforeEach(() => { now = 0; sequence = 0; engine = new TimerEngine({ now: () => now, uuid: () => `sesion-${++sequence}` }); });

describe('Motor y máquina de estados', () => {
  it('se crea sin sesión y sin acciones disponibles', () => { expect(engine.snapshot()).toBeNull(); expect(engine.pause()).toBe(false); expect(engine.resume()).toBe(false); expect(engine.stop()).toBe(false); expect(engine.reset()).toBe(false); });
  it('lanza una copia de la actividad', () => { engine.launch(activity); expect(engine.snapshot()).toMatchObject({ title: 'Presentación', state: STATES.RUNNING, remainingMs: 600000 }); });
  it('descuenta con el reloj aunque no haya actualizaciones visuales', () => { engine.launch(activity); now = 163243.5; expect(engine.tick().remainingMs).toBe(436756.5); });
  it('pausa exactamente, conserva una pausa prolongada y continúa', () => { engine.launch(activity); now = 1234.56; engine.pause(); const remaining = engine.remaining(); now += 8 * 3600000; expect(engine.remaining()).toBe(remaining); engine.resume(); now += 765.44; expect(engine.remaining()).toBeCloseTo(598000, 6); });
  it('detiene sin cambiar la duración original', () => { engine.launch(activity); now = 1234; engine.stop(); now += 999999; expect(engine.snapshot()).toMatchObject({ state: STATES.STOPPED, remainingMs: 598766, durationMs: 600000 }); });
  it.each(['Ejecutando', 'Pausado', 'Detenido', 'Finalizado'])('reinicia desde %s a Listo sin avanzar', (state) => { engine.launch(activity); if (state === 'Pausado') engine.pause(); if (state === 'Detenido') engine.stop(); if (state === 'Finalizado') { now = 600000; engine.tick(); } engine.reset(); now += 1000000; expect(engine.snapshot()).toMatchObject({ state: STATES.READY, remainingMs: 600000 }); });
  it('finaliza una vez y nunca muestra tiempo negativo', () => { engine.launch(activity); now = 9999999; expect(engine.tick()).toMatchObject({ state: STATES.FINISHED, remainingMs: 0 }); const version = engine.version; engine.tick(); expect(engine.version).toBe(version); expect(formatDuration(engine.remaining())).toBe('00:00'); });
  it('una pausa después del vencimiento conserva Finalizado', () => { engine.launch(activity); now = 600001; expect(engine.pause()).toBe(false); expect(engine.snapshot().state).toBe(STATES.FINISHED); });
  it('no duplica una sesión de la misma actividad en ejecución o pausa', () => { engine.launch(activity); const id = engine.session.sessionId; now = 5000; expect(engine.launch(activity)).toBe(false); expect(engine.remaining()).toBe(595000); engine.pause(); expect(engine.launch(activity)).toBe(false); expect(engine.session.sessionId).toBe(id); });
  it('exige confirmación para sustituir una actividad en ejecución', () => { engine.launch(activity); const next = { ...activity, id: 'b', title: 'Preguntas', durationMs: 300000 }; expect(() => engine.launch(next)).toThrow('Confirma'); expect(engine.session.activityId).toBe('a'); engine.launch(next, { replace: true }); expect(engine.snapshot()).toMatchObject({ activityId: 'b', remainingMs: 300000 }); });
  it.each(['stop', 'reset', 'finish'])('vuelve a lanzar desde la duración original después de %s', (action) => { engine.launch(activity); now = 5000; if (action === 'finish') { now = 600000; engine.tick(); } else engine[action](); engine.launch(activity); expect(engine.snapshot()).toMatchObject({ state: STATES.RUNNING, remainingMs: 600000, sessionId: 'sesion-2' }); });
  it('editar el objeto original no modifica la sesión', () => { const original = { ...activity }; engine.launch(original); original.title = 'Cambio'; original.durationMs = 1000; expect(engine.snapshot()).toMatchObject({ title: 'Presentación', durationMs: 600000 }); });
  it('reconstruye una sesión persistida detenida', () => { engine.restore({ ...activity, activityId: 'a', sessionId: 'previa', remainingMs: 1234, state: STATES.RUNNING }); now = 5000; expect(engine.snapshot()).toMatchObject({ state: STATES.STOPPED, remainingMs: 1234 }); });
  it('rechaza una sesión dañada', () => { expect(() => engine.restore({ ...activity, remainingMs: -1 })).toThrow(); });
  it('no permite transiciones inválidas', () => { engine.launch(activity); expect(engine.resume()).toBe(false); engine.stop(); expect(engine.pause()).toBe(false); expect(engine.resume()).toBe(false); expect(TRANSITIONS.Detenido.launch).toBe(STATES.RUNNING); });
  it('admite duraciones de varias horas', () => { engine.launch({ ...activity, durationMs: parseDuration('180:59') }); now = 60000; expect(formatDuration(engine.remaining())).toBe('179:59'); });
});

describe('Validación de actividades', () => {
  it.each(['00:00', '10:60', '5:99', '-1:00', '05:5', 'abc', '99999999999999999:00'])('rechaza %s', (value) => expect(() => parseDuration(value)).toThrow());
  it.each([['10:00', 600000], ['120:59', 7259000], ['1:01', 61000]])('admite %s', (value, expected) => expect(parseDuration(value)).toBe(expected));
  it('redondea hacia arriba para no mostrar cero antes de finalizar', () => { expect(formatDuration(.1)).toBe('00:01'); expect(formatDuration(-5)).toBe('00:00'); });
  it('admite acentos y comas, recorta extremos del título', () => expect(validateActivity({ title: '  Réplica, discusión  ', durationMs: 1000 }).title).toBe('Réplica, discusión'));
  it('rechaza títulos vacíos', () => expect(() => validateActivity({ title: ' ', durationMs: 1000 })).toThrow('título'));
});

describe('Copia original de una sesión', () => {
  it('mantiene la duración original al volver a lanzar un registro editado', () => { engine.launch(activity); now = 2500; engine.stop(); engine.launch({ ...activity, title: 'Editada', durationMs: 1000 }); expect(engine.snapshot()).toMatchObject({ title: 'Presentación', durationMs: 600000, remainingMs: 600000 }); });
});
