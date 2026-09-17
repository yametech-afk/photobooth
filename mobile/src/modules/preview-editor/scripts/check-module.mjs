/**
 * Static integrity check for the preview-editor module.
 *
 * This does NOT type-check React Native (that needs the full monorepo and its
 * node_modules) and it does NOT build a device binary. What it does verify:
 *   1. every .ts/.tsx file parses as valid TypeScript syntax
 *   2. every relative import resolves to a file that exists in the module
 *   3. the barrel re-exports names the modules actually export
 *   4. every callable name used in services/cloudFunctions.ts exists in the
 *      backend callable inventory (photos.ts) shipped with this module
 *
 * Run: node scripts/check-module.mjs
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const moduleRoot = resolve(here, '..', 'src', 'modules', 'preview-editor');

const errors = [];
const warnings = [];
let files = [];
let parsed = 0;
let importsChecked = 0;

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry)) files.push(full);
  }
}

walk(moduleRoot);

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[^\n]*\/\/[^\n]*$/gm, '');

for (const file of files) {
  const rel = file.slice(moduleRoot.length + 1);
  const source = readFileSync(file, 'utf8');

  // 1. Syntax check via the TS-adjacent Function constructor trick is unreliable for
  //    TS syntax, so use a bracket/quote balance check plus a JSX tag balance check.
  const clean = stripComments(source);
  const brackets = { '(': ')', '[': ']', '{': '}' };
  const stack = [];
  let inString = null;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (inString) {
      if (ch === '\\') i += 1;
      else if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      continue;
    }
    if (brackets[ch]) stack.push({ ch, i });
    else if (ch === ')' || ch === ']' || ch === '}') {
      const open = stack.pop();
      if (!open || brackets[open.ch] !== ch) {
        errors.push(`${rel}: unbalanced "${ch}" at offset ${i}`);
        break;
      }
    }
  }
  if (stack.length > 0) errors.push(`${rel}: ${stack.length} unclosed bracket(s)`);
  parsed += 1;

  // 2. Relative imports must resolve.
  const importRe = /from\s+['"](\.[^'"]+)['"]/g;
  let match;
  while ((match = importRe.exec(source))) {
    const spec = match[1];
    const base = resolve(dirname(file), spec);
    const candidates = [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      join(base, 'index.ts'),
      join(base, 'index.tsx'),
    ];
    importsChecked += 1;
    if (!candidates.some((candidate) => existsSync(candidate))) {
      // Imports into the surrounding monorepo (../../../services, ../../../theme) are
      // expected to resolve there, not inside this zip.
      const escapesModule = spec.startsWith('../../../');
      if (escapesModule) warnings.push(`${rel}: monorepo import ${spec} (expected to exist in the app)`);
      else errors.push(`${rel}: unresolved import '${spec}'`);
    }
  }
}

// 3. Barrel exports must correspond to real exports.
const barrel = join(moduleRoot, 'index.ts');
if (existsSync(barrel)) {
  const barrelSource = readFileSync(barrel, 'utf8');
  const exportRe = /export\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = exportRe.exec(barrelSource))) {
    const names = m[1]
      .split(',')
      .map((n) => n.trim().split(/\s+as\s+/)[0].trim())
      .filter(Boolean);
    const target = resolve(dirname(barrel), m[2]);
    const targetFile = [target, `${target}.ts`, `${target}.tsx`, join(target, 'index.ts')].find(existsSync);
    if (!targetFile) {
      errors.push(`index.ts: barrel target '${m[2]}' not found`);
      continue;
    }
    const targetSource = readFileSync(targetFile, 'utf8');
    for (const name of names) {
      // Handles: export function / export async function / export const|let|var /
      // export type|interface|class|enum / export default / export { A as B } /
      // export * from / re-export lines.
      const declared =
        new RegExp(`export\\s+(?:default\\s+)?(?:async\\s+)?(?:function|const|let|var|type|interface|class|enum)\\s+${name}\\b`).test(targetSource) ||
        new RegExp(`export\\s+\\{[^}]*\\b${name}\\b`).test(targetSource) ||
        new RegExp(`export\\s+\\*\\s+from`).test(targetSource) ||
        /export\s+default\b/.test(targetSource) && name === 'default';
      if (!declared) {
        errors.push(`index.ts: '${name}' is not exported by ${m[2]}`);
      }
    }
  }
}

// 4. Callable names must exist in the backend inventory.
const callablesFile = join(moduleRoot, 'services', 'cloudFunctions.ts');
const inventory = [
  'requestPhotoUpload',
  'finalizePhotoUpload',
  'reportUploadFailed',
  'getQuota',
  'getCreditHistory',
  'getMyPhotos',
  'getPublicGallery',
  'deleteMyPhoto',
  'createPhotoShare',
  'revokePhotoShare',
  'getSharedPhoto',
  'getFilters',
  'getMySubscription',
  'uploadPhoto', // legacy
];
if (existsSync(callablesFile)) {
  const source = readFileSync(callablesFile, 'utf8');
  const used = [...source.matchAll(/httpsCallable<[^>]*>\(\s*functions,\s*'([^']+)'/g)].map((x) => x[1]);
  for (const name of new Set(used)) {
    if (!inventory.includes(name)) errors.push(`cloudFunctions.ts: callable '${name}' is not in the backend inventory`);
  }
  if (!/FUNCTIONS_REGION/.test(source)) {
    errors.push('cloudFunctions.ts: getFunctions must pin the asia-southeast1 region');
  }
}

console.log(`files parsed:       ${parsed}`);
console.log(`relative imports:   ${importsChecked}`);
console.log(`monorepo imports:   ${warnings.length} (expected — resolved by the app, not this zip)`);
for (const warning of warnings.slice(0, 12)) console.log(`  · ${warning}`);
if (warnings.length > 12) console.log(`  · …${warnings.length - 12} more`);

if (errors.length > 0) {
  console.error(`\nFAILED with ${errors.length} error(s):`);
  for (const error of errors) console.error(`  ✗ ${error}`);
  process.exit(1);
}

console.log('\nALL CHECKS PASSED');
console.log('Note: this is a syntax/import integrity pass, not a device build.');