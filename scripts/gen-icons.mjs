#!/usr/bin/env node
/**
 * gen-icons.mjs — generate simple branded PNG app icons (gold ring on the dark
 * card color) with no image libraries, so web-push notifications and the PWA
 * manifest have real icons. Run: node scripts/gen-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Palette (matches the app): ink card + gold.
const BG = [23, 20, 17]; // #171411
const GOLD = [185, 144, 67]; // #B99043
const CREAM = [241, 230, 212]; // #F1E6D4

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function png(size) {
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size * 0.34;
  const rInner = size * 0.27;
  const rDot = size * 0.06;

  // Raw RGBA scanlines with a leading filter byte (0) per row.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      let col = BG;
      if (d <= rDot) col = GOLD; // center dot
      else if (d >= rInner && d <= rOuter) col = GOLD; // ring
      else if (d > rOuter && d <= rOuter + size * 0.012) col = CREAM; // thin cream edge
      raw[p++] = col[0];
      raw[p++] = col[1];
      raw[p++] = col[2];
      raw[p++] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  const out = resolve(root, "public", `icon-${size}.png`);
  writeFileSync(out, png(size));
  console.log("wrote", out);
}
// Apple touch icon (iOS home screen) — reuse the 192 art at 180px.
writeFileSync(resolve(root, "public", "apple-touch-icon.png"), png(180));
console.log("wrote apple-touch-icon.png");
