#!/usr/bin/env node
/**
 * ci-ensure-assets.mjs
 *
 * Ginagawa ang mga asset na tinutukoy ng app.json (icon, splash, adaptive icon,
 * favicon) KUNG WALA PA. Kailangan ito bago ang `expo prebuild`, dahil kapag may
 * tinutukoy na asset path na hindi umiiral, nabibigo ang prebuild.
 *
 * Purong Node — walang third-party dependency. Nakakagawa ng valid na RGBA PNG.
 *
 * Paggamit:
 *   node scripts/ci-ensure-assets.mjs
 *   node scripts/ci-ensure-assets.mjs --force   # i-overwrite kahit may file na
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, '..');
const ASSETS_DIR = path.join(PROJECT_ROOT, 'assets');
const FORCE = process.argv.includes('--force');

// ---------------------------------------------------------------------------
// Minimal PNG encoder (RGBA, 8-bit, no interlace)
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, [r, g, b, a = 255]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const rowBytes = width * 4;
  const raw = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (rowBytes + 1);
    raw[rowStart] = 0; // filter type: none
    for (let x = 0; x < width; x++) {
      const p = rowStart + 1 + x * 4;
      raw[p] = r;
      raw[p + 1] = g;
      raw[p + 2] = b;
      raw[p + 3] = a;
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Hanapin ang mga asset na tinutukoy ng app.json
// ---------------------------------------------------------------------------
const COLORS = {
  icon: [255, 77, 166], // #FF4DA6 (brand pink)
  adaptive: [10, 10, 31], // #0A0A1F (dark background)
  splash: [10, 10, 31],
  favicon: [255, 77, 166],
};

/** @returns {{file: string, width: number, height: number, color: number[]}[]} */
function collectReferencedAssets() {
  const appJsonPath = path.join(PROJECT_ROOT, 'app.json');
  const targets = [];

  if (!fs.existsSync(appJsonPath)) {
    // Walang app.json — walang tinutukoy, gumawa na lang ng default icon.
    targets.push({ file: 'assets/icon.png', width: 1024, height: 1024, color: COLORS.icon });
    return targets;
  }

  const expo = JSON.parse(fs.readFileSync(appJsonPath, 'utf8')).expo ?? {};

  if (typeof expo.icon === 'string') {
    targets.push({ file: expo.icon, width: 1024, height: 1024, color: COLORS.icon });
  }
  const adaptive = expo.android?.adaptiveIcon?.foregroundImage;
  if (typeof adaptive === 'string') {
    targets.push({ file: adaptive, width: 1024, height: 1024, color: COLORS.adaptive });
  }
  if (typeof expo.splash?.image === 'string') {
    targets.push({ file: expo.splash.image, width: 1284, height: 2778, color: COLORS.splash });
  }
  if (typeof expo.web?.favicon === 'string') {
    targets.push({ file: expo.web.favicon, width: 48, height: 48, color: COLORS.favicon });
  }

  if (targets.length === 0) {
    targets.push({ file: 'assets/icon.png', width: 1024, height: 1024, color: COLORS.icon });
  }
  return targets;
}

// ---------------------------------------------------------------------------
function main() {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
  const targets = collectReferencedAssets();
  let created = 0;
  let skipped = 0;

  for (const t of targets) {
    const abs = path.resolve(PROJECT_ROOT, t.file);
    if (fs.existsSync(abs) && !FORCE) {
      console.log(`skip   ${t.file} (umiiral na)`);
      skipped++;
      continue;
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, encodePng(t.width, t.height, t.color));
    console.log(`create ${t.file} (${t.width}x${t.height})`);
    created++;
  }

  console.log(`\nAssets: ${created} ginawa, ${skipped} nilaktawan.`);
  console.log('Tandaan: placeholder lang ang mga ito — palitan ng tunay na branding bago ang store release.');
}

main();
