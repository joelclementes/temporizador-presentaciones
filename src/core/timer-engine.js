import { validateActivity } from './activity.js';
import { STATES, TRANSITIONS } from './timer-state.js';

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
    if (this.session?.state === STATES.RUNNING && this.remaining() === 0) this.transition('finish');
    return this.snapshot();
  }

  snapshot() {
    return this.session ? { ...this.session, remainingMs: this.remaining(), version: this.version } : null;
  }

  launch(activity, { replace = false } = {}) {
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
    this.session = { sessionId: this.uuid(), activityId: valid.id, title: valid.title, durationMs: valid.durationMs, remainingMs: valid.durationMs, state: STATES.READY };
    this.transition('launch');
    return true;
  }

  transition(action) {
    if (!this.session) return false;
    const next = TRANSITIONS[this.session.state]?.[action];
    if (!next) return false;
    const remainingMs = this.remaining();
    this.session.remainingMs = action === 'reset' ? this.session.durationMs : action === 'finish' ? 0 : remainingMs;
    this.session.state = next;
    this.anchor = this.now();
    this.version += 1;
    return true;
  }

  pause() { this.tick(); return this.transition('pause'); }
  resume() { return this.transition('resume'); }
  stop() { this.tick(); return this.transition('stop'); }
  reset() { return this.transition('reset'); }

  restore(saved) {
    if (!saved) return;
    validateActivity({ title: saved.title, durationMs: saved.durationMs });
    if (!Number.isFinite(saved.remainingMs) || saved.remainingMs < 0 || saved.remainingMs > saved.durationMs) throw new Error('La última sesión no es válida.');
    this.session = { ...saved, state: STATES.STOPPED };
    this.version += 1;
  }
}
