import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { deflateSync } from 'node:zlib';

const root = process.cwd();
const buildDir = path.join(root, 'build');
const publicDir = path.join(root, 'public');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="24" y1="20" x2="232" y2="236" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#101624"/>
      <stop offset=".45" stop-color="#1f2340"/>
      <stop offset="1" stop-color="#0b0f19"/>
    </linearGradient>
    <linearGradient id="edge" x1="42" y1="31" x2="221" y2="226" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#2fffd0"/>
      <stop offset=".52" stop-color="#5865f2"/>
      <stop offset="1" stop-color="#d946ef"/>
    </linearGradient>
  </defs>
  <rect x="16" y="16" width="224" height="224" rx="54" fill="url(#bg)"/>
  <rect x="22" y="22" width="212" height="212" rx="48" fill="none" stroke="url(#edge)" stroke-width="8"/>
  <path d="M73 55h92c15 0 27 12 27 27v119c0 7-6 13-13 13H73c-12 0-22-10-22-22V77c0-12 10-22 22-22Z" fill="#f7fbff"/>
  <path d="M73 55h26v159H73c-12 0-22-10-22-22V77c0-12 10-22 22-22Z" fill="#5865f2"/>
  <path d="M119 96h50M119 123h43M119 150h55" stroke="#242938" stroke-width="10" stroke-linecap="round"/>
  <path d="M67 82h20M67 110h20M67 138h20M67 166h20" stroke="#c9d4ff" stroke-width="8" stroke-linecap="round"/>
  <path d="M113 191l33-51h-24l25-52-3 41h27l-58 62Z" fill="#2fffd0"/>
  <circle cx="169" cy="78" r="12" fill="#d946ef"/>
  <circle cx="196" cy="112" r="10" fill="#2fffd0"/>
  <circle cx="166" cy="139" r="9" fill="#8b5cf6"/>
  <path d="M169 78l27 34-30 27" stroke="#7487ff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function blend(px, color, alpha) {
  const inv = 1 - alpha;
  px[0] = Math.round(color[0] * alpha + px[0] * inv);
  px[1] = Math.round(color[1] * alpha + px[1] * inv);
  px[2] = Math.round(color[2] * alpha + px[2] * inv);
  px[3] = Math.round(255 * alpha + px[3] * inv);
}

function smooth(v) {
  return Math.max(0, Math.min(1, v));
}

function roundedRectAlpha(x, y, rx, ry, rw, rh, rr) {
  const cx = Math.max(rx + rr, Math.min(x, rx + rw - rr));
  const cy = Math.max(ry + rr, Math.min(y, ry + rh - rr));
  const d = Math.hypot(x - cx, y - cy) - rr;
  return smooth(0.75 - d);
}

function lineAlpha(x, y, x1, y1, x2, y2, width) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  const px = x1 + t * dx;
  const py = y1 + t * dy;
  return smooth(width / 2 + 0.75 - Math.hypot(x - px, y - py));
}

function circleAlpha(x, y, cx, cy, r) {
  return smooth(r + 0.75 - Math.hypot(x - cx, y - cy));
}

function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1];
    const xj = pts[j][0], yj = pts[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function drawIcon(size) {
  const data = Buffer.alloc(size * size * 4);
  const s = size / 256;
  const put = (x, y, color, a) => {
    if (a <= 0) return;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= size || iy >= size) return;
    const off = (iy * size + ix) * 4;
    blend(data.subarray(off, off + 4), color, Math.min(1, a));
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = x / s;
      const ny = y / s;
      const base = roundedRectAlpha(nx, ny, 16, 16, 224, 224, 54);
      if (!base) continue;
      const glow = circleAlpha(nx, ny, 70, 52, 142) * 0.22;
      const edge = Math.max(
        roundedRectAlpha(nx, ny, 20, 20, 216, 216, 50) -
          roundedRectAlpha(nx, ny, 28, 28, 200, 200, 42),
        0
      );
      const r = Math.round(11 + 26 * (ny / 256) + 60 * glow + 80 * edge);
      const g = Math.round(15 + 18 * (nx / 256) + 170 * edge);
      const b = Math.round(25 + 42 * (1 - ny / 256) + 210 * edge);
      put(x, y, [r, g, b], base);
    }
  }

  const shapes = [
    ['rect', 48, 53, 144, 162, 22, [247, 251, 255], 1],
    ['rect', 51, 55, 48, 159, 20, [88, 101, 242], 1],
    ['line', 119, 96, 169, 96, 10, [36, 41, 56], 1],
    ['line', 119, 123, 162, 123, 10, [36, 41, 56], 1],
    ['line', 119, 150, 174, 150, 10, [36, 41, 56], 1],
    ['line', 68, 82, 87, 82, 8, [201, 212, 255], 1],
    ['line', 68, 110, 87, 110, 8, [201, 212, 255], 1],
    ['line', 68, 138, 87, 138, 8, [201, 212, 255], 1],
    ['line', 68, 166, 87, 166, 8, [201, 212, 255], 1],
    ['line', 169, 78, 196, 112, 6, [116, 135, 255], 1],
    ['line', 196, 112, 166, 139, 6, [116, 135, 255], 1],
  ];
  const bolt = [[113, 191], [146, 140], [122, 140], [147, 88], [144, 129], [171, 129]];
  const circles = [
    [169, 78, 12, [217, 70, 239]],
    [196, 112, 10, [47, 255, 208]],
    [166, 139, 9, [139, 92, 246]],
  ];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = x / s;
      const ny = y / s;
      for (const sh of shapes) {
        let a = 0;
        if (sh[0] === 'rect') a = roundedRectAlpha(nx, ny, sh[1], sh[2], sh[3], sh[4], sh[5]);
        if (sh[0] === 'line') a = lineAlpha(nx, ny, sh[1], sh[2], sh[3], sh[4], sh[5]);
        put(x, y, sh[sh.length - 2], a * sh[sh.length - 1]);
      }
      if (pointInPoly(nx, ny, bolt)) put(x, y, [47, 255, 208], 1);
      for (const [cx, cy, r, color] of circles) put(x, y, color, circleAlpha(nx, ny, cx, cy, r));
    }
  }

  return data;
}

function png(size) {
  const rgba = drawIcon(size);
  const scanlines = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    scanlines[y * (size * 4 + 1)] = 0;
    rgba.copy(scanlines, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, buffer }) => {
    const entry = Buffer.alloc(16);
    entry[0] = size === 256 ? 0 : size;
    entry[1] = size === 256 ? 0 : size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += buffer.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.buffer)]);
}

await fs.mkdir(buildDir, { recursive: true });
await fs.mkdir(publicDir, { recursive: true });

const sizes = [256, 128, 64, 48, 32, 16];
const images = sizes.map((size) => ({ size, buffer: png(size) }));
await fs.writeFile(path.join(buildDir, 'icon.ico'), ico(images));
await fs.writeFile(path.join(buildDir, 'icon.png'), images[0].buffer);
await fs.writeFile(path.join(publicDir, 'icon.png'), images[0].buffer);
await fs.writeFile(path.join(publicDir, 'icon.svg'), svg);

console.info('Generated build/icon.ico, build/icon.png, public/icon.png, public/icon.svg');
