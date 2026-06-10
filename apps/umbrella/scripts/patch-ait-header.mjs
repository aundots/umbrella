import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const aitPath = path.join(root, 'umbrella.ait');

if (!fs.existsSync(aitPath)) {
  console.warn('[patch-ait-header] umbrella.ait not found, skip');
  process.exit(0);
}

const pyScript = path.join(path.dirname(fileURLToPath(import.meta.url)), 'patch-ait-header.py');
const changed = execSync(`python "${pyScript}" "${aitPath}"`, { encoding: 'utf8' }).trim();
console.log(`[patch-ait-header] patched ${changed} bundle file(s)`);
