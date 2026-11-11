import '../styles/display.css';
import { formatDuration } from '../core/activity.js';
import { openDatabase } from '../storage/database.js';
import { TimerChannel, SnapshotReceiver, HEARTBEAT_MS, scopeKey } from '../sync/timer-channel.js';
import { fitText } from './fit-text.js';
import { setupPWA } from './pwa.js';

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
function fit() {
  fitPending = false;
  fitText(title, document.getElementById('title-area'), { max: 170 });
  // Se mide un patrón estable de la misma longitud; tabular-nums evita saltos entre dígitos.
  fitText(time, document.getElementById('time-area'), { singleLine: true, max: 3000 });
}
function requestFit() { if (!fitPending) { fitPending = true; requestAnimationFrame(fit); } }
const channel = new TimerChannel((message) => {
  if (message.type === 'SNAPSHOT' && receiver.accept(message)) { liveReceived = true; controllerClosed = false; render(); }
  if (message.type === 'CONTROLLER_CLOSED') { controllerClosed = true; render(); }
  if (message.type === 'HIDE_DISPLAY') window.close();
});
function render() {
  const snapshot = receiver.snapshot;
  const nextTitle = snapshot?.title || 'Temporizador de Presentaciones';
  const nextTime = formatDuration(receiver.remaining());
  if (title.textContent !== nextTitle) title.textContent = nextTitle;
  if (time.textContent !== nextTime) time.textContent = nextTime;
  time.classList.toggle('finished', snapshot?.state === 'Finalizado' || (snapshot?.state === 'Ejecutando' && receiver.remaining() === 0));
  if (controllerClosed || receiver.isStale()) warning.textContent = 'Sin comunicación con el panel · estado sin verificar';
  else warning.textContent = snapshot?.state === 'Pausado' ? 'En pausa' : snapshot?.state === 'Detenido' ? 'Detenido' : '';
  if (fittedTitle !== nextTitle || fittedTime.length !== nextTime.length) { fittedTitle = nextTitle; fittedTime = nextTime; requestFit(); }
}
const requestState = () => channel.send('REQUEST_STATE', { viewerId });
const heartbeat = setInterval(() => { channel.send('VIEWER_ALIVE', { viewerId }); requestState(); }, HEARTBEAT_MS);
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
openDatabase({ name: `temporizador-v1:${scopeKey()}` }).then(async (db) => {
  const saved = await db.loadSession(); db.close();
  if (!liveReceived && saved) { receiver.snapshot = { ...saved, state: 'Detenido' }; render(); }
}).catch(() => { if (!liveReceived) warning.textContent = 'Abre el panel para recuperar el estado del temporizador.'; });
setupPWA({});
requestState();
function animate() { render(); requestAnimationFrame(animate); }
animate(); requestFit();
window.addEventListener('pagehide', () => { clearInterval(heartbeat); channel.send('VIEWER_CLOSED', { viewerId }); channel.close(); });
window.addEventListener('pageshow', (event) => { if (event.persisted) location.reload(); });
