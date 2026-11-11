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

describe.each(['countup', 'countdown'])('Modalidad %s y advertencia por ejecución', (mode) => {
  const start = (durationMs = 600000) => engine.launch({ ...activity, durationMs }, { mode });
  it('conserva modo, tiempo restante y transcurrido autoritativos', () => {
    start(); expect(engine.snapshot()).toMatchObject({ mode, remainingMs: 600000, elapsedMs: 0, warning: { status: 'pending' } });
    now = 1234.56; const snapshot = engine.tick();
    expect(snapshot.remainingMs).toBeCloseTo(598765.44, 6); expect(snapshot.elapsedMs).toBeCloseTo(1234.56, 6);
  });
  it('detecta exactamente el umbral sin detener ni reiniciar', () => {
    start(); now = 539999; expect(engine.tick().warning.status).toBe('pending');
    now = 540000; expect(engine.tick()).toMatchObject({ state: STATES.RUNNING, remainingMs: 60000, warning: { status: 'requested' } });
    expect(engine.resolveWarning(engine.session.sessionId, 'played')).toBe(true);
    now = 580000; expect(engine.tick().warning.status).toBe('played');
  });
  it('detecta el cruce aunque nunca se actualice a los 60 segundos', () => {
    start(); now = 538800; engine.tick(); now = 541300;
    expect(engine.tick()).toMatchObject({ remainingMs: 58700, warning: { status: 'requested' } });
    const version = engine.version; engine.tick(); expect(engine.version).toBe(version);
  });
  it('avisa sólo una vez al iniciar exactamente un minuto', () => {
    start(60000); expect(engine.snapshot().warning.status).toBe('requested');
    const id = engine.session.sessionId; engine.resolveWarning(id, 'played'); engine.tick();
    expect(engine.resolveWarning(id, 'played')).toBe(false); expect(engine.snapshot().warning.status).toBe('played');
    now = 60000; expect(engine.tick()).toMatchObject({ state: STATES.FINISHED, warning: { status: 'played' } });
  });
  it('omite el aviso para menos de un minuto y no avisa al finalizar', () => {
    start(30000); expect(engine.snapshot().warning.status).toBe('skipped'); now = 30000;
    expect(engine.tick()).toMatchObject({ state: STATES.FINISHED, remainingMs: 0, warning: { status: 'skipped' } });
  });
  it('no emite avisos tardíos si ya venció durante una suspensión', () => {
    start(); now = 900000; expect(engine.tick()).toMatchObject({ state: STATES.FINISHED, warning: { status: 'skipped' } });
  });
  it('excluye la pausa previa al aviso y no duplica al continuar después del aviso', () => {
    start(); now = 530000; engine.pause(); now += 3600000;
    expect(engine.tick().warning.status).toBe('pending'); engine.resume(); now += 10000; engine.tick();
    engine.resolveWarning(engine.session.sessionId, 'played'); engine.pause(); now += 3600000;
    engine.resume(); now += 5000; expect(engine.tick()).toMatchObject({ remainingMs: 55000, warning: { status: 'played' } });
  });
  it('cancela una solicitud incierta al pausar y no vuelve a intentarla', () => {
    start(60000); engine.pause(); engine.resume(); now += 5000;
    expect(engine.tick().warning.status).toBe('unavailable');
  });
  it('detiene sin avanzar ni emitir avisos posteriores', () => {
    start(); now = 20000; engine.stop(); now += 900000;
    expect(engine.tick()).toMatchObject({ remainingMs: 580000, elapsedMs: 20000, state: STATES.STOPPED, warning: { status: 'pending' } });
  });
  it('reinicia a Listo y el nuevo lanzamiento tiene otro aviso', () => {
    start(60000); const id = engine.session.sessionId; engine.resolveWarning(id, 'played'); now = 20000; engine.reset(); now += 900000;
    expect(engine.tick()).toMatchObject({ state: STATES.READY, remainingMs: 60000, elapsedMs: 0 });
    start(60000); expect(engine.snapshot()).toMatchObject({ sessionId: 'sesion-2', warning: { status: 'requested' } });
  });
  it('cambiar la preferencia no altera una sesión activa y se aplica al siguiente lanzamiento', () => {
    start(); expect(engine.launch(activity, { mode: mode === 'countup' ? 'countdown' : 'countup' })).toBe(false);
    expect(engine.snapshot().mode).toBe(mode); engine.stop(); engine.launch(activity, { mode: 'countup' }); expect(engine.snapshot().mode).toBe('countup');
  });
  it('cambiar actividad crea sesión y permite una nueva advertencia', () => {
    start(60000); const id = engine.session.sessionId; engine.resolveWarning(id, 'played');
    engine.launch({ ...activity, id: 'b', durationMs: 60000 }, { replace: true, mode });
    expect(engine.snapshot().warning).toEqual({ id: 'sesion-2', status: 'requested' });
    expect(engine.resolveWarning(id, 'played')).toBe(false);
  });
  it('recupera el modo y no reenvía solicitudes persistidas', () => {
    start(); now = 540000; const saved = engine.tick(); engine.restore(saved); now += 100000;
    expect(engine.snapshot()).toMatchObject({ mode, state: STATES.STOPPED, remainingMs: 60000, warning: { status: 'unavailable' } });
  });
});
