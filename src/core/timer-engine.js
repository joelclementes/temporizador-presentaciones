import { validateActivity } from './activity.js';
import { STATES, TRANSITIONS } from './timer-state.js';

export const normalizeMode = (mode) => mode === 'countup' ? 'countup' : 'countdown';
export function displayTime(snapshot, remainingMs = snapshot?.remainingMs || 0) {
  if (!snapshot) return 0;
  return normalizeMode(snapshot.mode) === 'countup' ? Math.min(snapshot.durationMs, Math.max(0, snapshot.durationMs - remainingMs)) : remainingMs;
}
// El cronómetro muestra segundos completos transcurridos; la cuenta atrás conserva su redondeo hacia arriba.
export const visibleTime = (snapshot, remainingMs) => snapshot?.mode === 'countup' ? Math.floor(displayTime(snapshot, remainingMs) / 1000) * 1000 : displayTime(snapshot, remainingMs);

// El reloj inyectado sólo se utiliza dentro de la ventana que controla la sesión.
export class TimerEngine {
  constructor({ now = () => performance.now(), uuid = () => crypto.randomUUID() } = {}) {
    this.now = now;
    this.uuid = uuid;
    this.session = null;
    this.version = 0;
    this.anchor = 0;
  }

  remaining() {
    if (!this.session) return 0;
    return Math.max(0, this.session.remainingMs - (this.session.state === STATES.RUNNING ? Math.max(0, this.now() - this.anchor) : 0));
  }

  tick() {
    if (this.session?.state === STATES.RUNNING) {
      const remaining = this.remaining();
      if (remaining === 0) this.transition('finish');
      else if (this.session.warning.status === 'pending' && remaining <= 60000) {
        // pending implica que todavía no se ha cruzado el umbral en esta ejecución.
        this.session.warning = { ...this.session.warning, status: 'requested' };
        this.version += 1;
      }
    }
    return this.snapshot();
  }

  snapshot() {
    const remainingMs = this.remaining();
    return this.session ? { ...this.session, warning: { ...this.session.warning }, remainingMs, elapsedMs: this.session.durationMs - remainingMs, version: this.version } : null;
  }

  launch(activity, { replace = false, mode = 'countdown' } = {}) {
    let valid = validateActivity(activity);
    this.tick();
    if (this.session && [STATES.RUNNING, STATES.PAUSED].includes(this.session.state)) {
      if (this.session.activityId === valid.id) return false;
      if (!replace) throw new Error('Confirma la sustitución del temporizador activo.');
    }
    if (this.session?.activityId === valid.id) {
      valid = { id: valid.id, title: this.session.title, durationMs: this.session.durationMs };
    }
    // Una sesión mantiene su copia original aunque se edite o elimine el registro.
    const sessionId = this.uuid();
    this.session = { sessionId, activityId: valid.id, title: valid.title, durationMs: valid.durationMs, remainingMs: valid.durationMs, mode: normalizeMode(mode), state: STATES.READY, warning: { id: sessionId, status: valid.durationMs >= 60000 ? 'pending' : 'skipped' } };
    this.transition('launch');
    this.tick();
    return true;
  }

  transition(action) {
    if (!this.session) return false;
    const next = TRANSITIONS[this.session.state]?.[action];
    if (!next) return false;
    const remainingMs = this.remaining();
    this.session.remainingMs = action === 'reset' ? this.session.durationMs : action === 'finish' ? 0 : remainingMs;
    this.session.state = next;
    if (action === 'reset') this.session.warning = { id: this.session.sessionId, status: this.session.durationMs >= 60000 ? 'pending' : 'skipped' };
    else if (action === 'finish' && this.session.warning.status === 'pending') this.session.warning.status = 'skipped';
    if (['pause', 'stop', 'reset', 'finish'].includes(action) && this.session.warning.status === 'requested') this.session.warning.status = 'unavailable';
    this.anchor = this.now();
    this.version += 1;
    return true;
  }

  pause() { this.tick(); return this.transition('pause'); }
  resume() { return this.transition('resume'); }
  stop() { this.tick(); return this.transition('stop'); }
  reset() { return this.transition('reset'); }

  resolveWarning(id, status) {
    if (this.session?.warning.id !== id || this.session.warning.status !== 'requested' || !['played', 'unavailable'].includes(status)) return false;
    this.session.warning = { ...this.session.warning, status };
    this.version += 1;
    return true;
  }

  restore(saved) {
    if (!saved) return;
    validateActivity({ title: saved.title, durationMs: saved.durationMs });
    if (!Number.isFinite(saved.remainingMs) || saved.remainingMs < 0 || saved.remainingMs > saved.durationMs) throw new Error('La última sesión no es válida.');
    this.session = { ...saved, mode: normalizeMode(saved.mode), warning: { id: saved.sessionId, ...saved.warning }, state: STATES.STOPPED };
    // Una solicitud incierta nunca se reenvía al recuperar un panel.
    if (!this.session.warning.status || this.session.warning.status === 'requested') this.session.warning.status = 'unavailable';
    this.version += 1;
  }
}
