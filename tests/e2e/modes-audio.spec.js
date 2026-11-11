import { test, expect } from '@playwright/test';

async function ready(page) {
  await page.goto('/');
  await expect(page.locator('#workspace-controls')).toBeEnabled();
}
async function add(page, title, duration) {
  await page.locator('#add').click(); await page.locator('#activity-title').fill(title);
  await page.locator('#activity-duration').fill(duration); await page.locator('#save-activity').click();
  await expect(page.locator('#activity-dialog')).not.toBeVisible();
  await page.getByRole('radio', { name: title, exact: true }).check();
}
async function show(page) {
  const popup = page.waitForEvent('popup'); await page.locator('#show').click();
  const display = await popup; await expect(display.locator('#display-time')).toBeVisible(); return display;
}
async function advance(page, ms) {
  await page.evaluate((ms) => { window.__clockOffset += ms; window.dispatchEvent(new Event('focus')); }, ms);
}
async function simulatedClock(context) {
  await context.addInitScript(() => {
    window.__clockOffset = 0;
    const realNow = performance.now.bind(performance);
    performance.now = () => realNow() + window.__clockOffset;
  });
}
async function simulatedAudio(context, { blocked = false } = {}) {
  await context.addInitScript(({ blocked }) => {
    window.__toneStarts = 0;
    class AudioContext {
      constructor() { this.state = 'suspended'; this.currentTime = 0; }
      async resume() { if (blocked) throw new DOMException('Autoplay bloqueado', 'NotAllowedError'); this.state = 'running'; this.onstatechange?.(); }
      createGain() { return { connect() {}, disconnect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {} } }; }
      createOscillator() {
        const node = { frequency: {}, connect() {}, disconnect() {}, start() { window.__toneStarts++; }, stop(at) { if (at !== undefined) setTimeout(() => node.onended?.(), at * 1000); } };
        return node;
      }
    }
    window.AudioContext = AudioContext;
  }, { blocked });
}
async function storedSession(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open(`temporizador-v1:${new URL('.', location.href).pathname}`, 1);
    request.onerror = reject;
    request.onsuccess = () => {
      const db = request.result; const tx = db.transaction('settings'); const get = tx.objectStore('settings').get('session');
      get.onsuccess = () => resolve(get.result); tx.oncomplete = () => db.close();
    };
  }));
}

test('radios accesibles, exclusivos y preferencia global persistida sin alterar CSV', async ({ page }) => {
  await ready(page);
  const group = page.getByRole('group', { name: 'Modalidad de conteo', exact: true });
  await expect(group.getByRole('radio')).toHaveCount(2);
  await expect(group.getByRole('radio', { name: 'Contador descendente (temporizador)', exact: true })).toBeChecked();
  await group.getByRole('radio', { name: 'Contador ascendente (cronómetro)', exact: true }).check();
  await expect(group.getByRole('radio', { name: 'Contador descendente (temporizador)', exact: true })).not.toBeChecked();
  await page.reload(); await expect(page.locator('input[value="countup"]')).toBeChecked();
  await expect(page.locator('#test-sound')).toBeVisible(); await expect(page.locator('#audio-status')).toContainText('pendiente');
  const download = page.waitForEvent('download'); await page.locator('#export').click();
  const file = await download; const stream = await file.createReadStream(); const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString('utf8')).toBe('\uFEFFPresentación,10:00\r\nPreguntas,05:00\r\nRespuestas,05:00\r\nRéplica,03:00\r\n');
});

test('cronómetro sincroniza avance, pausa, continuación, detención, reinicio y final en límite', async ({ page, context }) => {
  await simulatedClock(context); await ready(page); await page.locator('input[value="countup"]').check();
  let display = await show(page); await page.locator('#launch').click();
  await expect(page.locator('#remaining')).toHaveText('00:00'); await expect(display.locator('#display-time')).toHaveText('00:00');
  await expect(page.locator('#duration-label')).toHaveText('Tiempo límite');
  await expect(display.getByRole('radio')).toHaveCount(0);
  await advance(page, 12345); await page.locator('#pause').click();
  await expect(page.locator('#remaining')).toHaveText('00:12'); await expect(display.locator('#display-time')).toHaveText('00:12');
  await display.close(); display = await show(page); await display.reload();
  await expect(display.locator('#display-time')).toHaveText('00:12');
  await advance(page, 3600000); await expect(page.locator('#remaining')).toHaveText('00:12');
  await page.locator('input[value="countdown"]').check(); await page.locator('#pause').click();
  await expect(page.locator('#duration-label')).toHaveText('Tiempo límite');
  await advance(page, 3000); await page.locator('#stop').click();
  await expect(display.locator('#display-time')).toHaveText('00:15');
  await page.locator('#reset').click(); await expect(page.locator('#remaining')).toHaveText('00:00');
  await expect(page.locator('#timer-state')).toHaveText('Listo');
  await page.locator('#launch').click(); await expect(page.locator('#remaining')).toHaveText('10:00');
  await expect(page.locator('#duration-label')).toHaveText('Duración original');
  await page.locator('#stop').click();
  await page.locator('input[value="countup"]').check(); await page.locator('#launch').click();
  await advance(page, 900000); await expect(page.locator('#remaining')).toHaveText('10:00');
  await expect(display.locator('#display-time')).toHaveText('10:00'); await expect(page.locator('#timer-state')).toHaveText('Finalizado');
  await expect(page.locator('#remaining')).toHaveClass(/finished/); await expect(display.locator('#display-time')).toHaveClass(/finished/);
});

for (const mode of ['countup', 'countdown']) {
  test(`aviso único en ${mode}, cruza umbral con retraso, pausa y reapertura sin repetición`, async ({ page, context }) => {
    await simulatedClock(context); await simulatedAudio(context); await ready(page);
    await page.locator(`input[value="${mode}"]`).check(); await page.locator('#test-sound').click();
    await expect(page.locator('#test-sound')).toBeEnabled(); await expect(page.locator('#audio-status')).toContainText('habilitado en el panel');
    expect(await page.evaluate(() => window.__toneStarts)).toBe(2);
    let display = await show(page); await page.locator('#launch').click();
    await page.locator('#pause').click(); await advance(page, 120000);
    expect((await storedSession(page)).warning.status).toBe('pending');
    await page.locator('#pause').click(); await advance(page, 538800);
    expect((await storedSession(page)).warning.status).toBe('pending');
    await advance(page, 2500); await expect(page.locator('#warning-status')).toContainText('Advertencia emitida');
    expect(await page.evaluate(() => window.__toneStarts)).toBe(4); expect(await display.evaluate(() => window.__toneStarts)).toBe(0);
    await page.locator('#pause').click(); await advance(page, 120000); await page.locator('#pause').click();
    await display.close(); display = await show(page); await display.reload();
    await expect(display.locator('#display-title')).toHaveText('Presentación');
    expect(await display.evaluate(() => window.__toneStarts)).toBe(0);
    await advance(page, 60000); await expect(page.locator('#timer-state')).toHaveText('Finalizado');
    expect(await page.evaluate(() => window.__toneStarts)).toBe(4);
    await page.reload(); await expect(page.locator('#timer-state')).toHaveText('Detenido');
    expect(await page.evaluate(() => window.__toneStarts)).toBe(0);
    expect((await storedSession(page)).mode).toBe(mode);
  });
}

test('prefiere una sola ventana pública habilitada y tolera duplicados después de recargar', async ({ page, context }) => {
  await simulatedClock(context); await simulatedAudio(context); await ready(page); await add(page, 'Umbral', '01:01');
  const display = await show(page);
  const other = await context.newPage(); await other.goto('/display.html');
  for (const viewer of [display, other]) { await viewer.locator('#test-sound').click(); await expect(viewer.locator('#test-sound')).toBeEnabled(); }
  await expect(page.locator('#audio-status')).toContainText('habilitado en la ventana pública');
  await page.evaluate(() => {
    const channel = new BroadcastChannel(`temporizador:${new URL('.', location.href).pathname}`);
    channel.onmessage = ({ data }) => { if (data.type === 'AUDIO_WARNING') window.__lastGrant = data; };
    window.__capture = channel;
  });
  await page.locator('#launch').click(); await advance(page, 1500);
  await expect(page.locator('#warning-status')).toContainText('Advertencia emitida');
  const count = async () => (await display.evaluate(() => window.__toneStarts)) + (await other.evaluate(() => window.__toneStarts));
  expect(await count()).toBe(6); expect(await page.evaluate(() => window.__toneStarts)).toBe(0);
  await page.evaluate(() => { window.__capture.postMessage(window.__lastGrant); window.__capture.postMessage(window.__lastGrant); });
  expect(await count()).toBe(6);
  await display.reload(); await expect(display.locator('#display-time')).toBeVisible();
  await page.evaluate(() => window.__capture.postMessage(window.__lastGrant));
  await expect(page.locator('#warning-status')).toContainText('Advertencia emitida');
  expect(await display.evaluate(() => window.__toneStarts)).toBe(0);
});

test('la falta de confirmación del destinatario no provoca reintentos inciertos', async ({ page, context }) => {
  await simulatedClock(context); await simulatedAudio(context); await ready(page); await add(page, 'Entrega', '01:01');
  await page.locator('#test-sound').click(); await expect(page.locator('#test-sound')).toBeEnabled();
  const display = await show(page); await display.locator('#test-sound').click(); await expect(display.locator('#test-sound')).toBeEnabled();
  await expect(page.locator('#audio-status')).toContainText('habilitado en la ventana pública');
  // Simula un destinatario que pierde comunicación tras anunciar disponibilidad.
  await display.evaluate(() => { BroadcastChannel.prototype.postMessage = () => {}; window.AudioContext.prototype.createGain = () => { throw new Error('Dispositivo desconectado'); }; });
  await page.locator('#launch').click(); await advance(page, 1500);
  await expect(page.locator('#warning-status')).toContainText('sin reproducción confirmada');
  expect(await page.evaluate(() => window.__toneStarts)).toBe(2);
  await display.close(); await advance(page, 2000); expect(await page.evaluate(() => window.__toneStarts)).toBe(2);
});

test('restricciones de autoplay se explican, no se reintenta y Probar sonido no cambia sesión', async ({ page, context }) => {
  await simulatedClock(context); await simulatedAudio(context, { blocked: true }); await ready(page); await add(page, 'Un minuto', '01:00');
  await page.locator('#test-sound').click(); await expect(page.locator('#test-sound')).toBeEnabled();
  await expect(page.locator('#audio-status')).toContainText('No se pudo completar la prueba');
  expect(await storedSession(page)).toBeNull();
  await page.locator('#launch').click(); await expect(page.locator('#warning-status')).toContainText('sin reproducción confirmada');
  await expect(page.locator('#timer-state')).toHaveText('Ejecutando');
  await page.locator('#pause').click(); const session = await storedSession(page);
  await page.locator('#test-sound').click(); await expect(page.locator('#test-sound')).toBeEnabled();
  expect(await storedSession(page)).toEqual(session);
  await page.locator('#pause').click(); await advance(page, 70000);
  await expect(page.locator('#timer-state')).toHaveText('Finalizado'); expect(await page.evaluate(() => window.__toneStarts)).toBe(0);
});

test('AudioContext real sólo se declara habilitado tras interacción y prueba completada', async ({ page }) => {
  await ready(page); await expect(page.locator('#audio-status')).toContainText('pendiente');
  await page.locator('#test-sound').click(); await expect(page.locator('#test-sound')).toBeEnabled();
  await expect(page.locator('#audio-status')).toContainText('Sonido habilitado en el panel');
  expect(await storedSession(page)).toBeNull();
});
