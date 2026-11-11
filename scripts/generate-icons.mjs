// Iconos geométricos PNG sin dependencias de ejecución ni servicios externos.
import { deflateSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
function crc32(bytes) {
  let value = -1;
  for (const byte of bytes) { value ^= byte; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (0xedb88320 & -(value & 1)); }
  return (value ^ -1) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, crc]);
}
function icon(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const px = x / size, py = y / size;
    const radius = Math.hypot(px - 0.5, py - 0.56);
    const ring = Math.abs(radius - 0.255) < 0.025;
    const hand = (Math.abs(px - 0.5) < 0.021 && py > 0.40 && py < 0.57) || (Math.abs(py - (0.56 + (px - 0.5) * 0.6)) < 0.022 && px >= 0.5 && px < 0.63);
    const top = (py > 0.17 && py < 0.21 && px > 0.42 && px < 0.58) || (px > 0.48 && px < 0.52 && py >= 0.2 && py < 0.3);
    const color = ring || hand || top ? [94, 226, 177, 255] : [12, 20, 32, 255];
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    raw.set(color, offset);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
await writeFile('public/icons/icon-192.png', icon(192));
await writeFile('public/icons/icon-512.png', icon(512));
await writeFile('public/icons/maskable-512.png', icon(512));
