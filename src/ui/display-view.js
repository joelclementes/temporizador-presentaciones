import '../styles/display.css';
import { formatDuration } from '../core/activity.js';
import { openDatabase } from '../storage/database.js';
import { TimerChannel, SnapshotReceiver, HEARTBEAT_MS, scopeKey } from '../sync/timer-channel.js';
import { fitText } from './fit-text.js';
import { setupPWA } from './pwa.js';
import { visibleTime } from '../core/timer-engine.js';
import { WarningAudio, WarningDelivery } from '../audio/warning-audio.js';

const title = document.getElementById('display-title');
const time = document.getElementById('display-time');
const warning = document.getElementById('display-warning');
const fullscreen = document.getElementById('fullscreen');
const receiver = new SnapshotReceiver();
const viewerId = crypto.randomUUID();
let controllerClosed = false;
let liveReceived = false;
let fittedTitle = '', fittedTime = '';
let fitPending = false;
const audio = new WarningAudio({ changed: () => { renderAudio(); requestState(); } });
const database = openDatabase({ name: `temporizador-v1:${scopeKey()}` });
const delivery = new WarningDelivery({ audio, claim: async (id) => (await database).claimWarning(id), current: () => ({ snapshot: receiver.snapshot, epoch: receiver.epoch, remainingMs: receiver.remaining() }) });
function renderAudio() {
  document.getElementById('audio-status').textContent = audio.ready ? 'Sonido habilitado · verifica volumen' : audio.status === 'unavailable' ? 'Sonido no disponible' : 'Sonido pendiente de habilitar';
}
document.getElementById('test-sound').addEventListener('click', async (event) => {
  event.currentTarget.disabled = true;
  const played = await audio.test();
  renderAudio(); requestState();
  if (!played) document.getElementById('audio-status').textContent = 'Prueba sin confirmar · vuelve a habilitar';
  document.getElementById('test-sound').disabled = false;
});
function fit() {
  fitPending = false;
  fitText(title, document.getElementById('title-area'), { max: 170 });
  // Se mide un patrón estable de la misma longitud; tabular-nums evita saltos entre dígitos.
  fitText(time, document.getElementById('time-area'), { singleLine: true, max: 3000 });
}
function requestFit() { if (!fitPending) { fitPending = true; requestAnimationFrame(fit); } }
const channel = new TimerChannel((message) => {
  if (message.type === 'SNAPSHOT' && receiver.accept(message)) { liveReceived = true; controllerClosed = false; delivery.sync(); render(); }
  if (message.type === 'CONTROLLER_CLOSED') { controllerClosed = true; audio.cancel(); render(); }
  if (message.type === 'AUDIO_WARNING' && message.viewerId === viewerId && !controllerClosed && !receiver.isStale()) {
    void delivery.deliver(message).then((status) => { if (status) channel.send('AUDIO_RESULT', { epoch: message.epoch, viewerId, id: message.id, status }); });
  }
  if (message.type === 'HIDE_DISPLAY') window.close();
});
function render() {
  const snapshot = receiver.snapshot;
  const nextTitle = snapshot?.title || 'Temporizador de Presentaciones';
  const nextTime = formatDuration(visibleTime(snapshot, receiver.remaining()));
  if (title.textContent !== nextTitle) title.textContent = nextTitle;
  if (time.textContent !== nextTime) time.textContent = nextTime;
  time.classList.toggle('finished', snapshot?.state === 'Finalizado' || (snapshot?.state === 'Ejecutando' && receiver.remaining() === 0));
  if (controllerClosed || receiver.isStale()) warning.textContent = 'Sin comunicación con el panel · estado sin verificar';
  else warning.textContent = snapshot?.state === 'Pausado' ? 'En pausa' : snapshot?.state === 'Detenido' ? 'Detenido' : '';
  if (fittedTitle !== nextTitle || fittedTime.length !== nextTime.length) { fittedTitle = nextTitle; fittedTime = nextTime; requestFit(); }
}
const requestState = () => channel.send('REQUEST_STATE', { viewerId, audioReady: audio.ready });
const heartbeat = setInterval(() => { channel.send('VIEWER_ALIVE', { viewerId, audioReady: audio.ready }); requestState(); }, HEARTBEAT_MS);
new ResizeObserver(requestFit).observe(document.getElementById('display-stage'));
window.addEventListener('focus', requestState);
window.addEventListener('pageshow', requestState);
document.addEventListener('visibilitychange', () => { requestState(); render(); });
fullscreen.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    else warning.textContent = 'Maximiza la ventana con los controles de Windows.';
  } catch { warning.textContent = 'No se pudo activar pantalla completa. Maximiza la ventana manualmente.'; }
});
document.addEventListener('fullscreenchange', () => { fullscreen.setAttribute('aria-label', document.fullscreenElement ? 'Salir de pantalla completa' : 'Pantalla completa'); requestFit(); });
// La sesión persistida sólo es una referencia detenida hasta recibir confirmación del panel.
database.then(async (db) => {
  const saved = await db.loadSession();
  if (!liveReceived && saved) { receiver.snapshot = { ...saved, state: 'Detenido' }; render(); }
}).catch(() => { if (!liveReceived) warning.textContent = 'Abre el panel para recuperar el estado del temporizador.'; });
setupPWA({});
requestState();
function animate() { render(); requestAnimationFrame(animate); }
animate(); requestFit();
window.addEventListener('pagehide', () => { audio.cancel(); void database.then((db) => db.close(), () => {}); clearInterval(heartbeat); channel.send('VIEWER_CLOSED', { viewerId }); channel.close(); });
window.addEventListener('pageshow', (event) => { if (event.persisted) location.reload(); });
