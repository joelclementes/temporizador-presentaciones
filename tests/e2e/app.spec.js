import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, rm, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function ready(page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '＋ Agregar', exact: true })).toBeEnabled();
}
async function add(page, title, duration) {
  await page.getByRole('button', { name: '＋ Agregar', exact: true }).click();
  await page.getByLabel('Título', { exact: true }).fill(title);
  await page.getByLabel('Duración (MM:SS)').fill(duration);
  await page.getByRole('button', { name: 'Guardar actividad' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
}
async function launch(page) {
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: '▶ Lanzar', exact: true }).click();
  const display = await popup;
  await expect(display.locator('#display-time')).toBeVisible();
  return display;
}
const row = (page, title) => page.getByRole('row').filter({ has: page.getByRole('radio', { name: title, exact: true }) });

test('administra actividades, valida campos y conserva orden y datos al recargar', async ({ page }) => {
  await ready(page);
  await expect(page.getByRole('radio')).toHaveCount(4);
  await page.getByRole('button', { name: '＋ Agregar', exact: true }).click();
  await page.getByLabel('Título', { exact: true }).fill('Debate, "público"');
  await page.getByLabel('Duración (MM:SS)').fill('01:99');
  await page.getByRole('button', { name: 'Guardar actividad' }).click();
  await expect(page.locator('#form-error')).toContainText('segundos');
  await page.getByLabel('Duración (MM:SS)').fill('120:00');
  await page.getByRole('button', { name: 'Guardar actividad' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Subir: Debate, "público"', exact: true }).click();
  await expect(page.getByRole('radio').nth(3)).toHaveAccessibleName('Debate, "público"');
  await page.getByRole('button', { name: 'Editar: Debate, "público"', exact: true }).click();
  await page.getByLabel('Título', { exact: true }).fill('Debate editado');
  await page.getByRole('button', { name: 'Guardar actividad' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Eliminar: Preguntas', exact: true }).click();
  await expect(page.getByRole('radio')).toHaveCount(4);
  await page.reload();
  await expect(page.getByRole('radio')).toHaveCount(4);
  await expect(page.getByRole('radio').nth(2)).toHaveAccessibleName('Debate editado');
  await expect(row(page, 'Debate editado')).toContainText('120:00');
});

test('sincroniza pausa, continuación, detención y reinicio sin duplicar ventanas ni sesiones', async ({ page, context }) => {
  await ready(page);
  const display = await launch(page);
  await expect(display.locator('#display-title')).toHaveText('Presentación');
  await expect(page.locator('#connection')).toContainText('sincronizada');
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  await expect(display.locator('#display-warning')).toHaveText('En pausa');
  const paused = await display.locator('#display-time').textContent();
  await page.waitForTimeout(1200);
  await expect(display.locator('#display-time')).toHaveText(paused);
  await expect(page.locator('#remaining')).toHaveText(paused);
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.locator('#timer-state')).toHaveText('Ejecutando');
  await page.getByRole('button', { name: 'Mostrar ventana ↗', exact: true }).click();
  expect(context.pages()).toHaveLength(2);
  await page.getByRole('button', { name: '▶ Lanzar', exact: true }).click();
  expect(context.pages()).toHaveLength(2);
  await page.getByRole('button', { name: 'Detener', exact: true }).click();
  await expect(display.locator('#display-warning')).toHaveText('Detenido');
  await page.getByRole('button', { name: 'Reiniciar', exact: true }).click();
  await expect(display.locator('#display-time')).toHaveText('10:00');
  await expect(page.locator('#timer-state')).toHaveText('Listo');
  await page.waitForTimeout(1100);
  await expect(display.locator('#display-time')).toHaveText('10:00');
});

test('cerrar, reabrir y recargar la pantalla recupera el estado vigente', async ({ page }) => {
  await ready(page);
  let display = await launch(page);
  await display.close();
  await page.waitForTimeout(1200);
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Mostrar ventana ↗', exact: true }).click();
  display = await popup;
  await expect(display.locator('#display-title')).toHaveText('Presentación');
  await expect(display.locator('#display-time')).not.toHaveText('10:00');
  await display.reload();
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  await expect(display.locator('#display-warning')).toHaveText('En pausa');
  await expect(display.locator('#display-time')).toHaveText(await page.locator('#remaining').textContent());
});

test('protege el cambio de actividad y conserva la sesión si se edita o elimina el registro', async ({ page }) => {
  await ready(page);
  const display = await launch(page);
  await page.getByRole('radio', { name: 'Preguntas', exact: true }).check();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: '▶ Lanzar', exact: true }).click();
  await expect(display.locator('#display-title')).toHaveText('Presentación');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '▶ Lanzar', exact: true }).click();
  await expect(display.locator('#display-title')).toHaveText('Preguntas');
  await page.getByRole('button', { name: 'Editar: Preguntas', exact: true }).click();
  await page.getByLabel('Título', { exact: true }).fill('Editada');
  await page.getByLabel('Duración (MM:SS)').fill('90:00');
  await page.getByRole('button', { name: 'Guardar actividad' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(display.locator('#display-title')).toHaveText('Preguntas');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Eliminar: Editada', exact: true }).click();
  await expect(page.locator('#original-duration')).toHaveText('05:00');
  await expect(page.locator('#timer-state')).toHaveText('Ejecutando');
  await expect(display.locator('#display-title')).toHaveText('Preguntas');
});

test('finaliza en cero con color rojo en ambas ventanas', async ({ page }) => {
  await ready(page);
  await add(page, 'Cierre', '00:01');
  await page.getByRole('radio', { name: 'Cierre', exact: true }).check();
  const display = await launch(page);
  await expect(page.locator('#timer-state')).toHaveText('Finalizado');
  await expect(display.locator('#display-time')).toHaveText('00:00');
  await expect(display.locator('#display-time')).toHaveClass(/finished/);
  await expect(page.locator('#remaining')).toHaveClass(/finished/);
  await expect(page.getByRole('button', { name: 'Pausar', exact: true })).toBeDisabled();
});

test('importa y exporta UTF-8, comas y comillas, conservando datos ante errores y cancelación', async ({ page }) => {
  await ready(page);
  await page.locator('#csv-file').setInputFiles({ name: 'invalido.csv', mimeType: 'text/csv', buffer: Buffer.from('Buena,01:00\nMala,00:99') });
  await expect(page.locator('#message')).toContainText('Registro 2');
  await expect(page.getByRole('radio')).toHaveCount(4);
  const csv = '"Réplica, ""final""",120:00\r\nPreguntas,05:00\r\n';
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.locator('#csv-file').setInputFiles({ name: 'cancelar.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByRole('radio')).toHaveCount(4);
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#csv-file').setInputFiles({ name: 'valido.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByRole('radio')).toHaveCount(2);
  await expect(page.getByRole('radio').first()).toHaveAccessibleName('Réplica, "final"');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '↓ Exportar CSV', exact: true }).click();
  const saved = await download;
  expect(await readFile(await saved.path(), 'utf8')).toBe(`\uFEFF${csv}`);
});

test('un fallo de almacenamiento revierte la edición e informa el problema', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (key === 'activities') throw new DOMException('Simulación de cuota agotada', 'QuotaExceededError');
      return original.call(this, value, key);
    };
  });
  await page.getByRole('button', { name: 'Editar: Presentación', exact: true }).click();
  await page.getByLabel('Título', { exact: true }).fill('No guardada');
  await page.getByRole('button', { name: 'Guardar actividad' }).click();
  await expect(page.locator('#form-error')).toContainText('No se guardó');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Presentación', exact: true })).toBeVisible();
  await expect(page.locator('#message')).toContainText('almacenamiento local');
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Presentación', exact: true })).toBeVisible();
});

test('evita dos controladores y recupera la sesión detenida tras recargar el panel', async ({ page, context }) => {
  await ready(page);
  const display = await launch(page);
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  await expect(display.locator('#display-warning')).toHaveText('En pausa');
  const second = await context.newPage(); await second.goto('/');
  await expect(second.locator('#message')).toContainText('Ya hay un panel');
  await expect(second.getByRole('button', { name: '▶ Lanzar', exact: true })).toBeDisabled();
  await second.close();
  await page.reload();
  await expect(page.locator('#timer-state')).toHaveText('Detenido');
  await expect(display.locator('#display-warning')).toHaveText('Detenido');
  await expect(page.locator('#active-title')).toHaveText('Presentación');
});

test('avisa en la pantalla si se cierra el controlador', async ({ page }) => {
  await ready(page);
  const display = await launch(page);
  await page.close();
  await expect(display.locator('#display-warning')).toContainText('Sin comunicación', { timeout: 12000 });
});

test('informa un bloqueo de ventanas emergentes sin impedir el temporizador', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => { window.open = () => null; });
  await page.getByRole('button', { name: '▶ Lanzar', exact: true }).click();
  await expect(page.locator('#message')).toContainText('bloqueó la ventana');
  await expect(page.locator('#timer-state')).toHaveText('Ejecutando');
});

test('la pantalla completa y ocultar ventana responden a acciones explícitas', async ({ page }) => {
  await ready(page);
  const display = await launch(page);
  await display.getByRole('button', { name: 'Pantalla completa', exact: true }).click();
  await expect.poll(() => display.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await display.getByRole('button', { name: 'Salir de pantalla completa', exact: true }).click();
  await expect.poll(() => display.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  await page.getByRole('button', { name: 'Ocultar ventana', exact: true }).click();
  await expect.poll(() => display.isClosed()).toBe(true);
  await expect(page.locator('#timer-state')).toHaveText('Ejecutando');
});

test('el panel se adapta a laptop y móvil sin desbordamiento horizontal', async ({ page }) => {
  await ready(page);
  for (const [width, height] of [[1366, 768], [1920, 1080], [3840, 2160], [768, 1024], [375, 812]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: '▶ Lanzar', exact: true })).toBeVisible();
  }
});

test('ajusta números extensos y títulos largos a ventanas pequeñas y pantallas 4K', async ({ page }) => {
  await ready(page);
  const title = 'Presentación y discusión de resultados de investigación: preguntas, respuestas y conclusiones '.repeat(5).trim();
  await add(page, title, '180:59');
  await page.getByRole('radio', { name: title, exact: true }).check();
  const display = await launch(page);
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  for (const [width, height] of [[480, 300], [1366, 768], [1920, 1080], [3840, 2160], [320, 240]]) {
    await display.setViewportSize({ width, height });
    await expect.poll(() => display.evaluate(() => {
      return [['display-title', 'title-area'], ['display-time', 'time-area']].every(([id, containerId]) => {
        const box = document.getElementById(id).getBoundingClientRect();
        const outer = document.getElementById(containerId).getBoundingClientRect();
        return box.width <= outer.width && box.height <= outer.height && box.x >= 0 && box.right <= innerWidth && box.y >= 0 && box.bottom <= innerHeight;
      });
    })).toBe(true);
  }
  await mkdir('test-results', { recursive: true });
  await display.setViewportSize({ width: 1920, height: 1080 });
  await display.screenshot({ path: 'test-results/pantalla.png' });
});

test('valida manifiesto, iconos y recursos offline de producción', async ({ page }) => {
  await ready(page);
  await expect(page.locator('#offline-status')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: 'Verificar', exact: true }).click();
  const result = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    const manifestURL = new URL(link.href);
    const manifest = await (await fetch(manifestURL)).json();
    const icons = await Promise.all(manifest.icons.map(async (icon) => { const response = await fetch(new URL(icon.src, manifestURL)); const bitmap = await createImageBitmap(await response.blob()); return { width: bitmap.width, height: bitmap.height }; }));
    return { manifest, icons, controlled: Boolean(navigator.serviceWorker.controller) };
  });
  expect(result.manifest.display).toBe('standalone');
  expect(result.manifest.start_url).toBe('./index.html');
  expect(result.icons).toEqual([{ width: 192, height: 192 }, { width: 512, height: 512 }, { width: 512, height: 512 }]);
  expect(result.controlled).toBe(true);
  await page.screenshot({ path: 'test-results/panel.png', fullPage: true });
});

test('abre ambas interfaces sin conexión después de cerrar y reiniciar el navegador con el mismo perfil', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'temporizador-offline-'));
  let context;
  try {
    const options = { channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true, viewport: { width: 1366, height: 768 } };
    context = await chromium.launchPersistentContext(directory, options);
    let panel = context.pages()[0];
    await panel.goto('http://127.0.0.1:4173/');
    await expect(panel.locator('#offline-status')).toHaveAttribute('data-ready', 'true');
    await expect(panel.getByRole('button', { name: '＋ Agregar', exact: true })).toBeEnabled();
    await add(panel, 'Persistencia sin Internet', '90:00');
    await context.close();
    context = await chromium.launchPersistentContext(directory, { ...options, offline: true });
    panel = context.pages()[0];
    await panel.goto('http://127.0.0.1:4173/index.html');
    await expect(panel.getByRole('radio', { name: 'Persistencia sin Internet', exact: true })).toBeVisible();
    await panel.getByRole('radio', { name: 'Persistencia sin Internet', exact: true }).check();
    const display = await launch(panel);
    await expect(display.locator('#display-title')).toHaveText('Persistencia sin Internet');
    await panel.getByRole('button', { name: 'Pausar', exact: true }).click();
    await expect(display.locator('#display-warning')).toHaveText('En pausa');
    await display.reload();
    await expect(display.locator('#display-title')).toHaveText('Persistencia sin Internet');
    await expect(panel.locator('#offline-status')).toHaveAttribute('data-ready', 'true');
    const download = panel.waitForEvent('download');
    await panel.getByRole('button', { name: '↓ Exportar CSV', exact: true }).click();
    expect((await download).suggestedFilename()).toBe('actividades.csv');
    panel.once('dialog', (dialog) => dialog.accept());
    await panel.locator('#csv-file').setInputFiles({ name: 'offline.csv', mimeType: 'text/csv', buffer: Buffer.from('Importada offline,02:00') });
    await expect(panel.getByRole('radio')).toHaveCount(1);
  } finally { await context?.close(); await rm(directory, { recursive: true, force: true }); }
});

test('funciona en subcarpeta con ambas ventanas y recarga sin red', async ({ page, context }) => {
  await page.goto('http://127.0.0.1:4174/temporizador/');
  await expect(page.locator('#offline-status')).toHaveAttribute('data-ready', 'true');
  const display = await launch(page);
  expect(display.url()).toBe('http://127.0.0.1:4174/temporizador/display.html');
  await expect(display.locator('#display-title')).toHaveText('Presentación');
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  await expect(display.locator('#display-warning')).toHaveText('En pausa');
  await context.setOffline(true);
  await display.reload();
  await expect(display.locator('#display-title')).toHaveText('Presentación');
  await page.reload();
  await expect(page.locator('#timer-state')).toHaveText('Detenido');
  await expect(page.getByRole('radio')).toHaveCount(4);
  await expect(page.locator('#offline-status')).toHaveAttribute('data-ready', 'true');
});
