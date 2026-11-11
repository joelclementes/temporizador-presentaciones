import { describe, it, expect } from 'vitest';
import { TimerEngine, displayTime, visibleTime } from '../../src/core/timer-engine.js';
import { formatDuration } from '../../src/core/activity.js';

describe('Representación de modalidades', () => {
  it('cronómetro empieza en cero y muestra segundos completos sin adelantar el límite', () => {
    let now = 0;
    const engine = new TimerEngine({ now: () => now });
    engine.launch({ title: 'Larga', durationMs: 7259000 }, { mode: 'countup' });
    expect(formatDuration(visibleTime(engine.snapshot()))).toBe('00:00');
    now = 999; expect(formatDuration(visibleTime(engine.tick()))).toBe('00:00');
    now = 1000; expect(formatDuration(visibleTime(engine.tick()))).toBe('00:01');
    now = 3601000; expect(formatDuration(visibleTime(engine.tick()))).toBe('60:01');
    now = 7258999; expect(formatDuration(visibleTime(engine.tick()))).toBe('120:58');
    now = 8000000; expect(formatDuration(visibleTime(engine.tick()))).toBe('120:59');
    expect(engine.snapshot().state).toBe('Finalizado');
  });
  it('reinicio ascendente muestra cero sin iniciar', () => {
    let now = 0; const engine = new TimerEngine({ now: () => now });
    engine.launch({ title: 'Actividad', durationMs: 120000 }, { mode: 'countup' });
    now = 1300; engine.pause(); now = 80000;
    expect(displayTime(engine.snapshot())).toBe(1300); engine.reset();
    expect(visibleTime(engine.snapshot())).toBe(0); expect(engine.snapshot().state).toBe('Listo');
  });
  it('sesiones antiguas conservan countdown y no cambian el formato de cuenta atrás', () => {
    const engine = new TimerEngine();
    engine.restore({ title: 'Anterior', durationMs: 10000, remainingMs: 2001, state: 'Ejecutando' });
    expect(engine.snapshot().mode).toBe('countdown'); expect(formatDuration(visibleTime(engine.snapshot()))).toBe('00:03');
    expect(visibleTime(null)).toBe(0);
  });
});
