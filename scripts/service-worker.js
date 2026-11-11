/* Generado al compilar: no editar dist/sw.js. */
const VERSION = '__VERSION__';
const FILES = __FILES__;
const ROOT = new URL('./', self.location.href);
const PREFIX = `temporizador:${ROOT.pathname}:`;
const CACHE = `${PREFIX}${VERSION}`;
const urls = FILES.map((file) => new URL(file, ROOT).href);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(urls.map((url) => new Request(url, { cache: 'reload' })));
  })());
  // Sin skipWaiting: las actualizaciones esperan al cierre de todas las ventanas.
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== ROOT.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const url = new URL(event.request.url);
    let target = url.href;
    if (event.request.mode === 'navigate') {
      if (url.pathname === ROOT.pathname || url.pathname === `${ROOT.pathname}index.html`) target = new URL('index.html', ROOT).href;
      else if (url.pathname === `${ROOT.pathname}display.html`) target = new URL('display.html', ROOT).href;
    }
    return (await cache.match(target)) || fetch(event.request);
  })());
});
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'VERIFY_OFFLINE') return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const results = await Promise.all(urls.map((url) => cache.match(url)));
    event.ports[0]?.postMessage({ ready: results.every(Boolean), version: VERSION, resources: urls.length });
  })());
});
