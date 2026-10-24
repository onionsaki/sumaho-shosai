// Writes icons/icon-192.png and icons/icon-512.png using only node:zlib.
// Motif: four book spines standing on a shelf, white on the accent green.

import { deflateSync, crc32 } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const ACCENT = [0x2f, 0x5d, 0x50, 255];
const WHITE = [255, 253, 248, 255];
const SOFT = [0xc9, 0xdb, 0xd4, 255];

function draw(size) {
  const px = new Uint8Array(size * size * 4);
  const fill = (x0, y0, x1, y1, c) => {
    for (let y = Math.max(0, Math.round(y0)); y < Math.min(size, Math.round(y1)); y++) {
      for (let x = Math.max(0, Math.round(x0)); x < Math.min(size, Math.round(x1)); x++) px.set(c, (y * size + x) * 4);
    }
  };
  fill(0, 0, size, size, ACCENT);
  const u = size / 100; // design on a 100-unit grid; maskable safe zone is the central 80%
  const shelfY = 70;
  const spines = [[26, 34, 30, WHITE], [36, 44, 22, SOFT], [46, 55, 34, WHITE], [57, 64, 26, SOFT]];
  for (const [x0, x1, top, c] of spines) fill(x0 * u, top * u, x1 * u, shelfY * u, c);
  // a leaning book
  for (let i = 0; i < 40; i++) {
    const y = shelfY - i;
    const x = 65 + i * 0.22;
    fill(x * u, (y - 1) * u, (x + 8) * u, y * u, WHITE);
  }
  fill(20 * u, shelfY * u, 80 * u, (shelfY + 4) * u, WHITE);
  return px;
}

function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  writeFileSync(new URL(`../icons/icon-${size}.png`, import.meta.url), png(size, draw(size)));
  console.log(`icons/icon-${size}.png`);
}
