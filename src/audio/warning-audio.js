// Sin recursos externos. Dos tonos de 220 ms separados por 140 ms (580 ms en total).
export class WarningAudio {
  constructor({ Context = globalThis.AudioContext || globalThis.webkitAudioContext, changed = () => {} } = {}) {
    this.Context = Context;
    this.changed = changed;
    this.context = null;
    this.nodes = [];
    this.failed = !Context;
  }
  get ready() { return !this.failed && this.context?.state === 'running'; }
  get status() { return this.ready ? 'ready' : this.failed ? 'unavailable' : 'pending'; }
  async enable() {
    try {
      if (!this.Context) throw new Error('Web Audio no disponible');
      this.context ||= new this.Context();
      this.context.onstatechange = () => {
        if (this.context.state !== 'running') this.cancel();
        this.changed();
      };
      // Invocado directamente desde el clic. No se programa audio hasta comprobar running.
      const resumed = this.context.resume();
      await withTimeout(resumed, 1500);
      this.failed = this.context.state !== 'running';
    } catch { this.failed = true; }
    this.changed();
    return this.ready;
  }
  cancel() {
    this.finish?.(false);
    this.finish = null;
    for (const node of this.nodes.splice(0)) {
      node.onended = null;
      try { node.stop(); } catch { /* Ya terminó. */ }
      node.disconnect();
    }
  }
  async play() {
    if (!this.ready || this.busy) return false;
    this.busy = true;
    this.cancel();
    const context = this.context;
    const start = context.currentTime + .02;
    let gain;
    try {
      gain = context.createGain(); gain.connect(context.destination);
      gain.gain.setValueAtTime(0, start);
      const complete = new Promise((resolve) => { this.finish = resolve; });
      for (const [index, offset] of [0, .36].entries()) {
        const oscillator = context.createOscillator(); this.nodes.push(oscillator);
        oscillator.type = 'sine'; oscillator.frequency.value = index ? 880 : 740;
        oscillator.connect(gain);
        gain.gain.setValueAtTime(0, start + offset);
        gain.gain.linearRampToValueAtTime(.12, start + offset + .015);
        gain.gain.setValueAtTime(.12, start + offset + .18);
        gain.gain.linearRampToValueAtTime(0, start + offset + .22);
        if (index === 1) oscillator.onended = () => this.finish?.(this.ready);
        oscillator.start(start + offset); oscillator.stop(start + offset + .22);
      }
      const played = await withTimeout(complete, 1800);
      return played && this.ready;
    } catch { this.failed = true; this.changed(); return false; }
    finally { this.cancel(); gain?.disconnect(); this.busy = false; }
  }
  async test() {
    if (this.busy || this.testing) return false;
    this.testing = true;
    try { return await this.enable() && await this.play(); }
    finally { this.testing = false; }
  }
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Audio sin confirmación')), ms); })]).finally(() => clearTimeout(timer));
}

// Un permiso dirigido NO es una instantánea. Sólo el panel lo envía en el cruce; nunca se reenvía.
export class WarningDelivery {
  constructor({ audio, claim, current, wall = () => Date.now() }) {
    Object.assign(this, { audio, claim, current, wall });
    this.seen = new Set();
  }
  eligible(grant) {
    const { snapshot, epoch, remainingMs } = this.current();
    return epoch === grant.epoch && snapshot?.sessionId === grant.sessionId && snapshot.warning?.id === grant.id && snapshot.warning.status === 'requested' && snapshot.state === 'Ejecutando' && remainingMs > 0 && this.wall() >= grant.sentAt && this.wall() <= grant.expiresAt;
  }
  sync() {
    if (this.activeGrant && !this.eligible(this.activeGrant)) this.audio.cancel();
  }
  async deliver(grant) {
    if (this.seen.has(grant.id)) return null;
    if (!this.eligible(grant)) return 'unavailable';
    this.seen.add(grant.id);
    try {
      if (!this.audio.ready || !await this.claim(grant.id) || !this.eligible(grant)) return 'unavailable';
      this.activeGrant = grant;
      return await this.audio.play() ? 'played' : 'unavailable';
    } catch { return 'unavailable'; }
    finally { this.activeGrant = null; }
  }
}
