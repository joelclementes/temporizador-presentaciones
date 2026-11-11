export const HEARTBEAT_MS = 2000;
export const STALE_MS = 8000;
export const scopeKey = () => new URL('.', location.href).pathname;
export const channelName = () => `temporizador:${scopeKey()}`;

export class TimerChannel {
  constructor(onMessage, { name = channelName(), Channel = BroadcastChannel } = {}) {
    this.channel = new Channel(name);
    this.channel.onmessage = (event) => {
      if (event.data?.protocol === 1) onMessage(event.data);
    };
  }
  send(type, data = {}) { this.channel.postMessage({ ...data, protocol: 1, type }); }
  close() { this.channel.close(); }
}

// Los mensajes de una autoridad antigua o una secuencia anterior no pueden revertir la vista.
export class SnapshotReceiver {
  constructor({ now = () => performance.now(), wall = () => Date.now() } = {}) {
    this.now = now;
    this.wall = wall;
    this.epoch = -1;
    this.sequence = -1;
    this.receivedAt = -Infinity;
    this.snapshot = null;
  }
  accept(message) {
    if (!Number.isSafeInteger(message.epoch) || !Number.isSafeInteger(message.sequence) || !Number.isFinite(message.sentAt)) return false;
    if (message.epoch < this.epoch || (message.epoch === this.epoch && message.sequence <= this.sequence)) return false;
    if (message.snapshot && (!Number.isFinite(message.snapshot.remainingMs) || message.snapshot.remainingMs < 0)) return false;
    this.epoch = message.epoch;
    this.sequence = message.sequence;
    this.receivedAt = this.now();
    this.snapshot = message.snapshot ? { ...message.snapshot } : null;
    // Date.now es compatible entre ventanas; sólo compensa tránsito acotado. La proyección usa un reloj local monotónico.
    this.transitMs = Math.min(STALE_MS, Math.max(0, this.wall() - message.sentAt));
    return true;
  }
  isStale() { return this.now() - this.receivedAt > STALE_MS; }
  remaining() {
    if (!this.snapshot) return 0;
    const elapsed = this.snapshot.state === 'Ejecutando' ? this.transitMs + Math.min(STALE_MS, Math.max(0, this.now() - this.receivedAt)) : 0;
    return Math.max(0, this.snapshot.remainingMs - elapsed);
  }
}
