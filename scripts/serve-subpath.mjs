import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('dist');
const prefix = '/temporizador/';
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (!url.pathname.startsWith(prefix)) { response.writeHead(404); response.end('Ruta no encontrada'); return; }
  const target = resolve(root, decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html');
  if (target !== root && !target.startsWith(root + sep)) { response.writeHead(403); response.end(); return; }
  try {
    const body = await readFile(target);
    response.writeHead(200, { 'content-type': mime[extname(target)] || 'application/octet-stream', 'cache-control': 'no-cache' }); response.end(body);
  } catch { response.writeHead(404); response.end('Archivo no encontrado'); }
}).listen(4174, '127.0.0.1', () => console.log('Comprobación local: http://127.0.0.1:4174/temporizador/'));
