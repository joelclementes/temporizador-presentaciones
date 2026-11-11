import { describe, it, expect, vi, afterEach } from 'vitest';
import { WarningAudio, WarningDelivery } from '../../src/audio/warning-audio.js';

class Context {
  constructor() { this.state = 'suspended'; this.currentTime = 0; this.oscillators = []; this.gains = []; }
  async resume() { this.state = 'running'; this.onstatechange?.(); }
  createGain() {
    const gain = { connect: vi.fn(), disconnect: vi.fn(), gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() } };
    this.gains.push(gain); return gain;
  }
  createOscillator() {
    const oscillator = { frequency: {}, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn((at) => {
      if (at !== undefined) setTimeout(() => oscillator.onended?.(), at * 1000);
    }) };
    this.oscillators.push(oscillator); return oscillator;
  }
}
afterEach(() => vi.useRealTimers());
describe('Web Audio inyectable y restricciones', () => {
  it('no afirma estar habilitado antes de comprobar running', async () => {
    const audio = new WarningAudio({ Context }); expect(audio.status).toBe('pending');
    expect(await audio.play()).toBe(false); expect(audio.context).toBeNull();
    expect(await audio.enable()).toBe(true); expect(audio.status).toBe('ready');
  });
  it('genera dos tonos moderados y confirma al terminar, sin esperar tiempo real', async () => {
    vi.useFakeTimers(); const audio = new WarningAudio({ Context }); await audio.enable();
    const result = audio.play(); expect(audio.context.oscillators).toHaveLength(2);
    expect(audio.context.oscillators[0].start).toHaveBeenCalledWith(.02);
    expect(audio.context.oscillators[1].start).toHaveBeenCalledWith(.38);
    expect(audio.context.gains[0].gain.linearRampToValueAtTime).toHaveBeenCalledWith(.12, .035);
    await vi.advanceTimersByTimeAsync(600); expect(await result).toBe(true);
    expect(audio.context.gains[0].disconnect).toHaveBeenCalled();
  });
  it('prueba sonora habilita el contexto y no usa sesiones ni reclamaciones', async () => {
    vi.useFakeTimers(); const audio = new WarningAudio({ Context }); const test = audio.test();
    await vi.advanceTimersByTimeAsync(650); expect(await test).toBe(true);
  });
  it('API ausente informa no disponible sin excepciones', async () => {
    const audio = new WarningAudio({ Context: null }); expect(audio.status).toBe('unavailable'); expect(await audio.test()).toBe(false);
  });
  it('resume rechazado por el navegador no programa tonos', async () => {
    class Restricted extends Context { async resume() { throw new Error('NotAllowedError'); } }
    const audio = new WarningAudio({ Context: Restricted }); expect(await audio.test()).toBe(false);
    expect(audio.status).toBe('unavailable'); expect(audio.context.oscillators).toHaveLength(0);
  });
  it('resume pendiente no bloquea indefinidamente y requiere una nueva interacción', async () => {
    vi.useFakeTimers(); class Restricted extends Context { resume() { return new Promise(() => {}); } }
    const audio = new WarningAudio({ Context: Restricted }); const enabling = audio.enable();
    await vi.advanceTimersByTimeAsync(1501); expect(await enabling).toBe(false); expect(audio.status).toBe('unavailable');
  });
  it('no basta con resolver resume si el estado sigue suspended', async () => {
    class Restricted extends Context { async resume() {} }
    const audio = new WarningAudio({ Context: Restricted }); expect(await audio.enable()).toBe(false); expect(await audio.play()).toBe(false);
  });
  it('interrupción del contexto cancela la señal e informa disponibilidad', async () => {
    vi.useFakeTimers(); const audio = new WarningAudio({ Context }); await audio.enable(); const playing = audio.play();
    audio.context.state = 'suspended'; audio.context.onstatechange();
    expect(await playing).toBe(false); expect(audio.status).toBe('pending');
  });
  it('sin confirmación ended termina como fallido y no reintenta', async () => {
    vi.useFakeTimers(); const audio = new WarningAudio({ Context }); await audio.enable(); const playing = audio.play();
    audio.context.oscillators[1].onended = null; await vi.advanceTimersByTimeAsync(1801);
    expect(await playing).toBe(false); expect(audio.context.oscillators).toHaveLength(2);
  });
});

function fixture() {
  const snapshot = { sessionId: 'a', state: 'Ejecutando', warning: { id: 'a', status: 'requested' } };
  const current = { snapshot, epoch: 3, remainingMs: 59000 };
  const grant = { id: 'a', sessionId: 'a', epoch: 3, sentAt: 100, expiresAt: 2600 };
  const claimed = new Set();
  const claim = vi.fn(async (id) => { if (claimed.has(id)) return false; claimed.add(id); return true; });
  const audio = { ready: true, play: vi.fn(async () => true), cancel: vi.fn() };
  const create = () => new WarningDelivery({ audio, claim, current: () => current, wall: () => 200 });
  return { snapshot, current, grant, claim, audio, create };
}
describe('Entrega dirigida, idempotencia y recuperación', () => {
  it('sólo programa después de confirmar la reclamación persistente', async () => {
    const f = fixture(); let done;
    f.claim.mockImplementation(() => new Promise((resolve) => { done = resolve; }));
    const delivery = f.create(); const result = delivery.deliver(f.grant);
    expect(f.audio.play).not.toHaveBeenCalled(); done(true); expect(await result).toBe('played');
  });
  it('mensajes duplicados durante la entrega no reproducen ni contradicen el resultado', async () => {
    const f = fixture(), delivery = f.create();
    const results = await Promise.all([delivery.deliver(f.grant), delivery.deliver(f.grant)]);
    expect(results).toEqual(['played', null]); expect(f.audio.play).toHaveBeenCalledTimes(1);
  });
  it('cerrar/reabrir o recargar no repite un permiso reclamado', async () => {
    const f = fixture(); expect(await f.create().deliver(f.grant)).toBe('played');
    expect(await f.create().deliver(f.grant)).toBe('unavailable'); expect(f.audio.play).toHaveBeenCalledTimes(1);
  });
  it.each(['epoch', 'session', 'expired', 'future', 'paused', 'stopped', 'finished', 'played', 'pending', 'zero'])('rechaza entrega antigua o inválida: %s', async (change) => {
    const f = fixture();
    if (change === 'epoch') f.grant.epoch = 2;
    if (change === 'session') f.grant.sessionId = 'anterior';
    if (change === 'expired') f.grant.expiresAt = 199;
    if (change === 'future') f.grant.sentAt = 201;
    if (change === 'paused') f.snapshot.state = 'Pausado';
    if (change === 'stopped') f.snapshot.state = 'Detenido';
    if (change === 'finished') f.snapshot.state = 'Finalizado';
    if (change === 'played') f.snapshot.warning.status = 'played';
    if (change === 'pending') f.snapshot.warning.status = 'pending';
    if (change === 'zero') f.current.remainingMs = 0;
    expect(await f.create().deliver(f.grant)).toBe('unavailable'); expect(f.audio.play).not.toHaveBeenCalled();
  });
  it('si se pausa mientras se escribe la reclamación no reproduce al terminar', async () => {
    const f = fixture(); f.claim.mockImplementation(async () => { f.snapshot.state = 'Pausado'; return true; });
    expect(await f.create().deliver(f.grant)).toBe('unavailable'); expect(f.audio.play).not.toHaveBeenCalled();
  });
  it('cancela la señal al pausar o cambiar de sesión', async () => {
    const f = fixture(); let finish; f.audio.play.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const delivery = f.create(); const playing = delivery.deliver(f.grant); await Promise.resolve(); await Promise.resolve();
    f.snapshot.sessionId = 'b'; delivery.sync(); expect(f.audio.cancel).toHaveBeenCalled(); finish(false); expect(await playing).toBe('unavailable');
  });
  it('no reintenta una reproducción fallida al recibir duplicados', async () => {
    const f = fixture(); f.audio.play.mockResolvedValue(false); const delivery = f.create();
    expect(await delivery.deliver(f.grant)).toBe('unavailable'); expect(await delivery.deliver(f.grant)).toBeNull(); expect(f.audio.play).toHaveBeenCalledTimes(1);
  });
  it('restricciones del navegador y almacenamiento fallido no lanzan errores', async () => {
    const f = fixture(); f.audio.ready = false; expect(await f.create().deliver(f.grant)).toBe('unavailable'); expect(f.claim).not.toHaveBeenCalled();
    f.audio.ready = true; f.claim.mockRejectedValue(new Error('QuotaExceededError'));
    expect(await f.create().deliver(f.grant)).toBe('unavailable'); expect(f.audio.play).not.toHaveBeenCalled();
  });
});
