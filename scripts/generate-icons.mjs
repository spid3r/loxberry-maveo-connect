#!/usr/bin/env node
/**
 * Writes LoxBerry-required PNGs (64/128/256/512) — garage door motif, transparent background.
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, "..", "icons");

function crc32(buf) {
  let crc = ~0 >>> 0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (~crc) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** RGBA PNG, simple panel + arc “door” (dark teal / cyan accent). */
function makePng(size) {
  const w = size;
  const h = size;
  const rows = [];
  const bg = [0x1a, 0x2e, 0x35, 0xee];
  const frame = [0x2d, 0x4a, 0x52, 0xff];
  const accent = [0x4f, 0xd1, 0xc5, 0xff];
  const margin = Math.max(4, Math.floor(size * 0.08));
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 4);
    row[0] = 0;
    for (let x = 0; x < w; x++) {
      const o = 1 + x * 4;
      let r = bg[0],
        g = bg[1],
        b = bg[2],
        a = bg[3];
      const ix = x < margin || x >= w - margin || y < margin || y >= h - margin;
      if (ix) {
        r = frame[0];
        g = frame[1];
        b = frame[2];
        a = frame[3];
      }
      const cx = w * 0.5;
      const cy = h * 0.42;
      const rw = w * 0.38;
      const rh = h * 0.42;
      const nx = (x - cx) / rw;
      const ny = (y - cy) / rh;
      if (nx * nx + ny * ny <= 1 && y >= margin + 2 && y <= h - margin - 2) {
        r = accent[0];
        g = accent[1];
        b = accent[2];
        a = accent[3];
      }
      row[o] = r;
      row[o + 1] = g;
      row[o + 2] = b;
      row[o + 3] = a;
    }
    rows.push(row);
  }
  const raw = Buffer.concat(rows);
  const compressed = deflateSync(raw);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", compressed), chunk("IEND", Buffer.alloc(0))]);
}

if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true });
for (const s of [64, 128, 256, 512]) {
  const p = join(iconsDir, `icon_${s}.png`);
  writeFileSync(p, makePng(s));
  console.log("Wrote", p);
}
