#!/usr/bin/env node
/**
 * Renders the PNG app icons into ../icons/ with no dependencies.
 *
 * Usage: node tools/make-icons.mjs
 *
 * The pound sign is drawn from simple geometry (line segments and one arc) and
 * anti-aliased with 4x4 supersampling. The PNG encoder is hand-written: an IHDR, an IDAT
 * (zlib deflate of filtered RGBA scanlines) and an IEND, each with a CRC-32.
 *
 * Outputs:
 *   icons/icon-192.png              rounded square, pound sign at 56% of the height
 *   icons/icon-512.png              rounded square, pound sign at 56% of the height
 *   icons/icon-maskable-512.png     full bleed square, pound sign inside the central 80% safe zone
 *   icons/apple-touch-icon-180.png  full bleed square (iOS applies its own corner mask)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'icons');

// Same colours as the manifest and icon.svg.
const BG = [0x0f, 0x27, 0x41];
const FG = [0xf4, 0xf7, 0xfb];

// Glyph geometry in "glyph units". The pound sign spans roughly x 265..715 and y 165..835.
const STROKE = 70;
const HALF = STROKE / 2;
const GLYPH_CENTRE = { x: 490, y: 500 };
const GLYPH_HEIGHT = 670;
const SEGMENTS = [
  [380, 340, 380, 800], // stem
  [380, 800, 680, 800], // base bar
  [300, 500, 600, 500], // cross bar
];
const ARC = { cx: 520, cy: 340, r: 140, fromDeg: -180, toDeg: -20 };
const ARC_END = { x: ARC.cx + ARC.r * Math.cos((ARC.toDeg * Math.PI) / 180), y: ARC.cy + ARC.r * Math.sin((ARC.toDeg * Math.PI) / 180) };

function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  let t = len2 === 0 ? 0 : ((px - ax) * vx + (py - ay) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

function inGlyph(x, y) {
  for (const [ax, ay, bx, by] of SEGMENTS) {
    if (distToSegment(x, y, ax, ay, bx, by) <= HALF) return true;
  }
  const dx = x - ARC.cx;
  const dy = y - ARC.cy;
  if (Math.abs(Math.hypot(dx, dy) - ARC.r) <= HALF) {
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (angle >= ARC.fromDeg && angle <= ARC.toDeg) return true;
  }
  // Round cap at the free end of the arc.
  return Math.hypot(x - ARC_END.x, y - ARC_END.y) <= HALF;
}

function inRoundedRect(x, y, size, radius) {
  if (radius <= 0) return true;
  const cx = Math.min(Math.max(x, radius), size - radius);
  const cy = Math.min(Math.max(y, radius), size - radius);
  return Math.hypot(x - cx, y - cy) <= radius;
}

/**
 * @returns {Buffer} RGBA pixels, row-major, 4 bytes per pixel.
 */
function renderIcon(size, { rounded, glyphFraction }) {
  const out = Buffer.alloc(size * size * 4);
  const pxPerUnit = (glyphFraction * size) / GLYPH_HEIGHT;
  const radius = rounded ? size * 0.22 : 0;
  const N = 4;
  const samples = N * N;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let covered = 0;
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const px = x + (i + 0.5) / N;
          const py = y + (j + 0.5) / N;
          if (!inRoundedRect(px, py, size, radius)) continue;
          const gx = (px - size / 2) / pxPerUnit + GLYPH_CENTRE.x;
          const gy = (py - size / 2) / pxPerUnit + GLYPH_CENTRE.y;
          const c = inGlyph(gx, gy) ? FG : BG;
          sr += c[0];
          sg += c[1];
          sb += c[2];
          covered += 1;
        }
      }
      const idx = (y * size + x) * 4;
      if (covered > 0) {
        out[idx] = Math.round(sr / covered);
        out[idx + 1] = Math.round(sg / covered);
        out[idx + 2] = Math.round(sb / covered);
        out[idx + 3] = Math.round((255 * covered) / samples);
      }
    }
  }
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function encodePng(size, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // no interlace

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter type 0 (None)
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([signature, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

const TARGETS = [
  { file: 'icon-192.png', size: 192, rounded: true, glyphFraction: 0.56 },
  { file: 'icon-512.png', size: 512, rounded: true, glyphFraction: 0.56 },
  // Maskable: the glyph sits well inside the central 80% safe zone.
  { file: 'icon-maskable-512.png', size: 512, rounded: false, glyphFraction: 0.5 },
  { file: 'apple-touch-icon-180.png', size: 180, rounded: false, glyphFraction: 0.56 },
];

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const t of TARGETS) {
    const png = encodePng(t.size, renderIcon(t.size, t));
    const path = join(OUT_DIR, t.file);
    writeFileSync(path, png);
    console.log(`wrote ${path} (${t.size}x${t.size}, ${png.length} bytes)`);
  }
}

main();
