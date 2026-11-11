import { describe, it, expect, beforeEach } from 'vitest';
import { SnapshotReceiver, STALE_MS, TimerChannel } from '../../src/sync/timer-channel.js';
let now, wall, receiver;
const message = (changes = {}) => ({ epoch: 1, sequence: 1, sentAt: 100000, snapshot: { sessionId: 'a', state: 'Ejecutando', remainingMs: 10000 }, ...changes });
beforeEach(() => { now = 0; wall = 100000; receiver = new SnapshotReceiver({ now: () => now, wall: () => wall }); });
describe('Protocolo y recuperación de instantáneas', () => {
  it('proyecta el estado con un reloj local, compensando el tránsito', () => { wall += 120; receiver.accept(message()); now += 3000; expect(receiver.remaining()).toBe(6880); });
  it('ignora mensajes retrasados y duplicados', () => { receiver.accept(message({ sequence: 5 })); expect(receiver.accept(message({ sequence: 4 }))).toBe(false); expect(receiver.accept(message({ sequence: 5 }))).toBe(false); });
  it('ignora una autoridad antigua incluso con secuencia superior', () => { receiver.accept(message({ epoch: 2 })); expect(receiver.accept(message({ epoch: 1, sequence: 999 }))).toBe(false); });
  it('admite la nueva generación y sustituye una sesión anterior', () => { receiver.accept(message({ sequence: 999 })); expect(receiver.accept(message({ epoch: 2, snapshot: { sessionId: 'b', state: 'Detenido', remainingMs: 2000 } }))).toBe(true); now += 50000; expect(receiver.remaining()).toBe(2000); });
  it('no descuenta una instantánea pausada', () => { receiver.accept(message({ snapshot: { state: 'Pausado', remainingMs: 7543.2 } })); now += 100000; expect(receiver.remaining()).toBe(7543.2); });
  it('advierte y limita la proyección si pierde comunicación', () => { receiver.accept(message()); now += STALE_MS + 50000; expect(receiver.isStale()).toBe(true); expect(receiver.remaining()).toBe(2000); });
  it('recupera el tiempo vigente al recibir una instantánea nueva', () => { receiver.accept(message()); now = 15000; wall += 15000; receiver.accept(message({ sequence: 2, sentAt: wall, snapshot: { state: 'Ejecutando', remainingMs: 30000 } })); expect(receiver.isStale()).toBe(false); expect(receiver.remaining()).toBe(30000); });
  it('nunca proyecta un tiempo negativo', () => { receiver.accept(message({ snapshot: { state: 'Ejecutando', remainingMs: 1 } })); now += 500; expect(receiver.remaining()).toBe(0); });
  it('rechaza mensajes sin versión o tiempo válido', () => { expect(receiver.accept({})).toBe(false); expect(receiver.accept(message({ sequence: NaN }))).toBe(false); expect(receiver.accept(message({ snapshot: { remainingMs: -1 } }))).toBe(false); });
  it('admite el estado inicial sin sesión', () => { receiver.accept(message({ snapshot: null })); expect(receiver.snapshot).toBeNull(); expect(receiver.remaining()).toBe(0); });
  it('sólo entrega mensajes de la versión del protocolo soportada', () => {
    let delivered;
    class Channel { constructor() { this.closed = false; } postMessage(data) { this.sent = data; } close() { this.closed = true; } }
    const channel = new TimerChannel((data) => { delivered = data; }, { name: 'test', Channel });
    channel.send('REQUEST_STATE'); expect(channel.channel.sent).toMatchObject({ protocol: 1, type: 'REQUEST_STATE' });
    channel.channel.onmessage({ data: { protocol: 7 } }); expect(delivered).toBeUndefined();
    channel.channel.onmessage({ data: { protocol: 1 } }); expect(delivered.protocol).toBe(1);
    channel.close(); expect(channel.channel.closed).toBe(true);
  });
});
