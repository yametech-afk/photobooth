#!/usr/bin/env node
/**
 * ci-inject-signing.mjs
 *
 * Ginagamit ang `ANDROID_KEYSTORE_BASE64` (at kaugnay na env vars) para gawin
 * ang totoong release signing sa `android/app/build.gradle` na ginawa ng
 * `expo prebuild`.
 *
 * Kung walang secrets, HINDI ito tinatakbo (may `if:` guard ang workflow).
 * Kapag tumakbo ito at kulang ang secrets, babalik ito ng non-zero exit para
 * hindi makapag-release ng maling-signed na APK nang tahimik.
 *
 * Paggamit:
 *   node scripts/ci-inject-signing.mjs [path/to/android/app/build.gradle]
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const gradlePath = process.argv[2] || 'android/app/build.gradle';
const keystorePath = path.join(path.dirname(gradlePath), 'release.keystore');

const b64 = (process.env.ANDROID_KEYSTORE_BASE64 || '').trim();
const storePassword = process.env.ANDROID_KEYSTORE_PASSWORD || '';
const keyAlias = process.env.ANDROID_KEY_ALIAS || '';
const keyPassword = process.env.ANDROID_KEY_PASSWORD || process.env.ANDROID_KEYSTORE_PASSWORD || '';

function fail(msg) {
  console.error(`::error::${msg}`);
  process.exit(1);
}

if (!b64) fail('Walang ANDROID_KEYSTORE_BASE64 — hindi ma-inject ang release signing.');
if (!storePassword) fail('Walang ANDROID_KEYSTORE_PASSWORD.');
if (!keyAlias) fail('Walang ANDROID_KEY_ALIAS.');
if (!keyPassword) fail('Walang ANDROID_KEY_PASSWORD.');
if (!fs.existsSync(gradlePath)) fail(`Hindi mahanap ang ${gradlePath} — patakbuhin muna ang expo prebuild.`);

let gradle = fs.readFileSync(gradlePath, 'utf8');

if (gradle.includes('signingConfigs.release')) {
  console.log(`skip   ${gradlePath} (may signingConfigs.release na)`);
  process.exit(0);
}

// 1) I-decode ang keystore.
fs.writeFileSync(keystorePath, Buffer.from(b64, 'base64'));
console.log(`create ${keystorePath}`);

// 2) Hanapin ang `signingConfigs { ... }` gamit ang brace matching.
function findBlockEnd(src, openBraceIndex) {
  let depth = 0;
  for (let i = openBraceIndex; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const signingConfigsKey = 'signingConfigs';
const scIdx = gradle.indexOf(signingConfigsKey);
if (scIdx === -1) fail('Walang `signingConfigs` block sa build.gradle.');

const scOpen = gradle.indexOf('{', scIdx);
if (scOpen === -1) fail('Hindi mabuksan ang `signingConfigs` block.');
const scClose = findBlockEnd(gradle, scOpen);
if (scClose === -1) fail('Hindi maisara ang `signingConfigs` block.');

const indent = '        ';
const releaseBlock =
  `\n${indent}release {\n` +
  `${indent}    storeFile file('release.keystore')\n` +
  `${indent}    storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')\n` +
  `${indent}    keyAlias System.getenv('ANDROID_KEY_ALIAS')\n` +
  `${indent}    keyPassword System.getenv('ANDROID_KEY_PASSWORD')\n` +
  `${indent}}\n`;

gradle = gradle.slice(0, scClose) + releaseBlock + gradle.slice(scClose);

// 3) Sa `buildTypes` -> `release`, gamitin ang bagong signing config.
const btIdx = gradle.indexOf('buildTypes');
if (btIdx === -1) fail('Walang `buildTypes` block sa build.gradle.');
const btOpen = gradle.indexOf('{', btIdx);
const btClose = findBlockEnd(gradle, btOpen);
if (btOpen === -1 || btClose === -1) fail('Hindi ma-parse ang `buildTypes` block.');

let btBlock = gradle.slice(btOpen, btClose);
const releaseTypeIdx = btBlock.search(/\brelease\s*\{/);
if (releaseTypeIdx === -1) fail('Walang `release` build type sa build.gradle.');

const relOpen = btBlock.indexOf('{', releaseTypeIdx);
const relClose = findBlockEnd(btBlock, relOpen);
if (relOpen === -1 || relClose === -1) fail('Hindi ma-parse ang `release` build type.');

const relBlock = btBlock.slice(relOpen, relClose);
if (!relBlock.includes('signingConfig signingConfigs.debug')) {
  fail('Hindi mahanap ang `signingConfig signingConfigs.debug` sa release build type — malamang iba na ang template.');
}
const patchedRelBlock = relBlock.replace(
  'signingConfig signingConfigs.debug',
  'signingConfig signingConfigs.release'
);

btBlock = btBlock.slice(0, relOpen) + patchedRelBlock + btBlock.slice(relClose);
gradle = gradle.slice(0, btOpen) + btBlock + gradle.slice(btClose);

fs.writeFileSync(gradlePath, gradle);
console.log(`patch  ${gradlePath} (release build type -> signingConfigs.release)`);
console.log('OK: naka-inject ang upload keystore signing.');
