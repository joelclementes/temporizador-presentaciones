import '../styles/control.css';
import { TimerEngine } from '../core/timer-engine.js';
import { formatDuration, parseDuration, validateActivity } from '../core/activity.js';
import { openDatabase } from '../storage/database.js';
import { importCSV, exportCSV } from '../storage/csv.js';
import { TimerChannel, HEARTBEAT_MS, STALE_MS, scopeKey } from '../sync/timer-channel.js';
import { ScreenManager } from '../screens/screen-manager.js';
import { setupPWA } from './pwa.js';

const $ = (id) => document.getElementById(id);
function notify(text, error = false) {
  $('message').textContent = text;
  $('message').dataset.error = String(error);
  $('message').hidden = false;
}
setupPWA({ status: $('offline-status'), installButton: $('install'), verifyButton: $('verify-offline') });

async function initialize() {
  const db = await openDatabase({ name: `temporizador-v1:${scopeKey()}` });
  let activities = await db.loadActivities();
  let selectedId = activities[0]?.id;
  let editingId = null;
  let saving = false;
  let persistQueue = Promise.resolve();
  let sequence = 0;
  let lastViewerAt = -Infinity;
  const viewers = new Map();
  const epoch = await db.nextEpoch();
  const engine = new TimerEngine();
  try { engine.restore(await db.loadSession()); } catch { notify('No se pudo recuperar la última sesión. La configuración de actividades sigue disponible.', true); }
  const screens = new ScreenManager((text) => notify(text, true));
  const channel = new TimerChannel((message) => {
    if (message.type === 'REQUEST_STATE') { lastViewerAt = performance.now(); viewers.set(message.viewerId, lastViewerAt); publish(false); }
    if (message.type === 'VIEWER_ALIVE') { lastViewerAt = performance.now(); viewers.set(message.viewerId, lastViewerAt); }
    if (message.type === 'VIEWER_CLOSED') { viewers.delete(message.viewerId); lastViewerAt = viewers.size ? Math.max(...viewers.values()) : -Infinity; }
  });

  function persist() {
    const snapshot = engine.snapshot();
    persistQueue = persistQueue.then(() => db.saveSession(snapshot)).catch(() => notify('La última sesión no se pudo guardar. El temporizador continúa; revisa el almacenamiento antes del siguiente evento.', true));
  }
  function publish(save = true) {
    channel.send('SNAPSHOT', { epoch, sequence: ++sequence, sentAt: Date.now(), snapshot: engine.snapshot() });
    if (save) persist();
  }
  function updateSelection() {
    const selected = activities.find((item) => item.id === selectedId);
    $('launch').disabled = !selected && !engine.session;
    $('selection-hint').textContent = selected ? `Seleccionada: ${selected.title} · ${formatDuration(selected.durationMs)}` : engine.session ? 'La actividad original sigue disponible en el temporizador activo.' : 'Agrega una actividad para comenzar.';
  }
  function renderActivities() {
    const body = $('activities');
    body.replaceChildren();
    activities.forEach((activity, index) => {
      const row = document.createElement('tr');
      row.classList.toggle('selected', activity.id === selectedId);
      const titleCell = row.insertCell();
      const label = document.createElement('label'); label.className = 'activity-option';
      const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'selected-activity'; radio.value = activity.id; radio.checked = activity.id === selectedId; radio.disabled = saving;
      const text = document.createElement('span'); text.textContent = activity.title;
      label.append(radio, text); titleCell.append(label);
      radio.addEventListener('change', () => { selectedId = activity.id; renderActivities(); });
      const duration = row.insertCell(); duration.className = 'row-duration'; duration.textContent = formatDuration(activity.durationMs);
      const actionsCell = row.insertCell(); const actions = document.createElement('div'); actions.className = 'row-actions'; actionsCell.append(actions);
      const buttons = [
        ['↑', 'Subir', () => move(index, -1), index === 0],
        ['↓', 'Bajar', () => move(index, 1), index === activities.length - 1],
        ['✎', 'Editar', () => openEditor(activity), false],
        ['×', 'Eliminar', () => remove(activity), false],
      ];
      buttons.forEach(([symbol, name, action, unavailable]) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = `icon-button${name === 'Eliminar' ? ' delete' : ''}`; button.textContent = symbol; button.title = `${name}: ${activity.title}`; button.setAttribute('aria-label', `${name}: ${activity.title}`); button.disabled = saving || unavailable; button.addEventListener('click', action); actions.append(button);
      });
      body.append(row);
    });
    $('activity-count').textContent = activities.length;
    $('empty').hidden = activities.length > 0;
    $('export').disabled = saving || !activities.length;
    $('import').disabled = saving;
    $('add').disabled = saving;
    updateSelection();
  }
  async function commit(next) {
    if (saving) return false;
    saving = true;
    $('save-status').textContent = 'Guardando…';
    renderActivities();
    try {
      const clean = await db.saveActivities(next);
      activities = clean;
      if (!activities.some((item) => item.id === selectedId)) selectedId = activities[0]?.id;
      $('save-status').textContent = '✓ Guardado en este equipo';
      return true;
    } catch (error) { $('save-status').textContent = 'Error al guardar · cambios descartados'; notify(error.message, true); return false; }
    finally { saving = false; renderActivities(); }
  }
  function openEditor(activity) {
    editingId = activity?.id || null;
    $('dialog-title').textContent = activity ? 'Editar actividad' : 'Agregar actividad';
    $('activity-title').value = activity?.title || '';
    $('activity-duration').value = activity ? formatDuration(activity.durationMs) : '10:00';
    $('form-error').textContent = '';
    $('activity-dialog').showModal();
    $('activity-title').focus();
  }
  async function move(index, delta) {
    const next = [...activities];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    await commit(next);
  }
  async function remove(activity) {
    if (confirm(`¿Eliminar «${activity.title}»? Una sesión activa conservará su tiempo.`)) await commit(activities.filter((item) => item.id !== activity.id));
  }
  $('add').addEventListener('click', () => openEditor());
  $('cancel-edit').addEventListener('click', () => $('activity-dialog').close());
  $('activity-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const activity = validateActivity({ id: editingId, title: $('activity-title').value, durationMs: parseDuration($('activity-duration').value) });
      const next = editingId ? activities.map((item) => item.id === editingId ? activity : item) : [...activities, activity];
      $('save-activity').disabled = true;
      if (await commit(next)) $('activity-dialog').close();
      else $('form-error').textContent = 'No se guardó la actividad. Revisa el mensaje del panel e inténtalo de nuevo.';
    } catch (error) { $('form-error').textContent = error.message; }
    finally { $('save-activity').disabled = false; }
  });
  $('import').addEventListener('click', () => $('csv-file').click());
  $('csv-file').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file || saving) return;
    try {
      const content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      const next = importCSV(content);
      if (confirm(`¿Sustituir las ${activities.length} actividades por ${next.length} registros del CSV? El temporizador activo seguirá igual.`)) {
        if (await commit(next)) notify(`Se importaron ${next.length} actividades. La configuración anterior fue sustituida.`);
      }
    } catch (error) { notify(error instanceof TypeError ? 'No se pudo leer el CSV como UTF-8. Guarda el archivo con esa codificación.' : error.message, true); }
    finally { event.target.value = ''; }
  });
  $('export').addEventListener('click', () => {
    const blob = new Blob(['\uFEFF', exportCSV(activities)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'actividades.csv'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Respaldo CSV descargado. Consérvalo antes de cambiar de equipo o borrar los datos del navegador.');
  });
  $('launch').addEventListener('click', () => {
    const activity = activities.find((item) => item.id === selectedId) || (engine.session && { id: engine.session.activityId, title: engine.session.title, durationMs: engine.session.durationMs });
    if (!activity) return;
    engine.tick();
    const busy = engine.session && ['Ejecutando', 'Pausado'].includes(engine.session.state);
    if (busy && engine.session.activityId !== activity.id && !confirm(`¿Sustituir «${engine.session.title}» por «${activity.title}»?`)) return;
    engine.launch(activity, { replace: true });
    // Se abre sin esperas asíncronas para conservar la activación del usuario.
    screens.show();
    publish();
    renderTimer();
  });
  for (const [id, action] of [['pause', () => engine.session?.state === 'Pausado' ? engine.resume() : engine.pause()], ['stop', () => engine.stop()], ['reset', () => engine.reset()]]) {
    $(id).addEventListener('click', () => { action(); publish(); renderTimer(); });
  }
  $('show').addEventListener('click', () => { screens.show(); publish(false); });
  $('hide').addEventListener('click', () => { screens.hide(); channel.send('HIDE_DISPLAY'); });
  $('choose-screen').hidden = !('getScreenDetails' in window);
  let availableScreens = [];
  $('choose-screen').addEventListener('click', async () => {
    try {
      availableScreens = await screens.getScreens();
      $('screen-choice').replaceChildren(new Option('Elegir monitor…', ''));
      availableScreens.forEach((screen, index) => $('screen-choice').add(new Option(`${screen.label || `Pantalla ${index + 1}`} (${screen.width} × ${screen.height})`, String(index))));
      $('screen-label').hidden = false;
    } catch { notify('No se concedió acceso a las pantallas. Mueve la ventana manualmente con Windows + Mayús + Flecha izquierda o derecha.'); }
  });
  $('screen-choice').addEventListener('change', () => {
    if ($('screen-choice').value === '') return;
    try { screens.select(availableScreens[Number($('screen-choice').value)]); notify('Pantalla seleccionada. Pulsa Mostrar ventana; también puedes moverla manualmente.'); }
    catch { notify('El navegador no permitió mover la ventana. Arrástrala al monitor elegido.'); }
  });

  let renderedTimer = '';
  function renderTimer() {
    const snapshot = engine.snapshot();
    const state = snapshot?.state || 'Listo';
    const time = formatDuration(snapshot?.remainingMs || 0);
    const connected = performance.now() - lastViewerAt <= STALE_MS;
    const renderKey = `${snapshot?.sessionId}:${state}:${time}:${connected}:${innerWidth}`;
    if (renderKey === renderedTimer) return;
    renderedTimer = renderKey;
    $('active-title').textContent = snapshot?.title || 'Sin actividad activa';
    if ($('remaining').textContent !== time) $('remaining').textContent = time;
    // El panel también admite minutos extensos sin desbordar la tarjeta.
    $('remaining').style.fontSize = time.length > 5 ? `${Math.max(16, Math.min(112, ($('remaining').clientWidth - 16) / (time.length * .62)))}px` : '';
    $('remaining').classList.toggle('finished', state === 'Finalizado');
    $('timer-state').textContent = state; $('timer-state').dataset.state = state;
    $('original-duration').textContent = snapshot ? formatDuration(snapshot.durationMs) : '—';
    $('pause').textContent = state === 'Pausado' ? 'Continuar' : 'Pausar';
    $('pause').disabled = !['Ejecutando', 'Pausado'].includes(state);
    $('stop').disabled = !['Ejecutando', 'Pausado'].includes(state);
    $('reset').disabled = !snapshot;
    $('connection').textContent = connected ? '● Ventana conectada y sincronizada' : 'Sin ventana conectada';
    $('connection').dataset.connected = String(connected);
  }
  let frame;
  function animate() {
    const previous = engine.version;
    engine.tick();
    if (engine.version !== previous) publish();
    renderTimer();
    frame = requestAnimationFrame(animate);
  }
  const heartbeat = setInterval(() => { engine.tick(); publish(); renderTimer(); }, HEARTBEAT_MS);
  const recover = () => { engine.tick(); publish(); renderTimer(); };
  window.addEventListener('focus', recover);
  document.addEventListener('visibilitychange', recover);
  $('save-status').textContent = '✓ Guardado en este equipo';
  $('workspace-controls').disabled = false;
  renderActivities(); renderTimer(); publish(); animate();
  return () => { clearInterval(heartbeat); cancelAnimationFrame(frame); channel.send('CONTROLLER_CLOSED'); channel.close(); db.close(); };
}

// Un único panel puede escribir y controlar el reloj dentro del mismo origen y ruta.
if (!navigator.locks) {
  notify('Este navegador no permite garantizar un único controlador. Usa una versión reciente de Edge o Chrome desde HTTPS o localhost.', true);
} else {
  navigator.locks.request(`controlador:${scopeKey()}`, { ifAvailable: true }, async (lock) => {
    if (!lock) { notify('Ya hay un panel de control abierto. Usa ese panel o ciérralo y recarga esta ventana.', true); return; }
    try {
      const cleanup = await initialize();
      await new Promise((resolve) => window.addEventListener('pagehide', () => { cleanup(); resolve(); }, { once: true }));
    } catch (error) { notify(error.message || 'No se pudo iniciar la aplicación. Recarga y revisa el almacenamiento local.', true); }
  }).catch(() => notify('No se pudo obtener el control de la aplicación. Cierra otros paneles y recarga.', true));
}
window.addEventListener('pageshow', (event) => { if (event.persisted) location.reload(); });
