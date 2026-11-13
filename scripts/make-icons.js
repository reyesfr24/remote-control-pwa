// Genera los iconos PNG de la app sin dependencias (iOS no acepta SVG como icono).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'client', 'public');

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Distancia con signo a un rectángulo redondeado centrado en (0,0).
function roundRect(x, y, hw, hh, r) {
  const qx = Math.abs(x) - hw + r;
  const qy = Math.abs(y) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
// Triángulo de "play" apuntando a la derecha.
function inPlay(x, y, s) {
  return x >= -0.5 * s && y >= -0.6 * s + (x + 0.5 * s) * 0.6 && y <= 0.6 * s - (x + 0.5 * s) * 0.6 && x <= 0.5 * s;
}

function render(size, { full }) {
  const SS = 4;
  const buf = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          // Coordenadas normalizadas -1..1
          const x = ((px + (sx + 0.5) / SS) / size) * 2 - 1;
          const y = ((py + (sy + 0.5) / SS) / size) * 2 - 1;
          const bg = full ? -1 : roundRect(x, y, 1, 1, 0.45);
          if (bg > 0) continue;
          // Fondo con degradado suave
          const t = (y + 1) / 2;
          let c = [18 - t * 8, 20 - t * 8, 30 - t * 10];
          // Marco del touchpad
          const pad = roundRect(x, y + 0.04, 0.58, 0.44, 0.14);
          if (Math.abs(pad) < 0.045) c = [124, 140, 255];
          // Botón de play
          if (inPlay(x - 0.04, y + 0.04, 0.36)) c = [205, 212, 255];
          r += c[0]; g += c[1]; b += c[2]; a += 255;
        }
      }
      const n = SS * SS;
      const i = (py * size + px) * 4;
      const cov = a / n / 255;
      buf[i] = cov ? r / (a / 255) : 0;
      buf[i + 1] = cov ? g / (a / 255) : 0;
      buf[i + 2] = cov ? b / (a / 255) : 0;
      buf[i + 3] = a / n;
    }
  }
  return png(size, buf);
}

fs.mkdirSync(OUT, { recursive: true });
// iOS redondea las esquinas por su cuenta, así que el apple-touch-icon va a sangre.
fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), render(180, { full: true }));
fs.writeFileSync(path.join(OUT, 'icon-192.png'), render(192, { full: false }));
fs.writeFileSync(path.join(OUT, 'icon-512.png'), render(512, { full: true }));
// Icono .ico para el acceso directo de Windows (un PNG dentro de un contenedor ICO).
const icoPng = render(256, { full: false });
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header[6] = 0; // 0 = 256 px
header[7] = 0;
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(icoPng.length, 14);
header.writeUInt32LE(22, 18);
fs.writeFileSync(path.join(OUT, '..', '..', 'scripts', 'mando-pc.ico'), Buffer.concat([header, icoPng]));
console.log('Iconos generados en', OUT);
