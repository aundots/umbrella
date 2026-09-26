import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const granite = readFileSync(join(root, 'granite.config.ts'), 'utf8');
const match = granite.match(/https:\/\/static\.toss\.im\/[^\s'"]+\.png/);

const url = match?.[0]?.trim() ?? '';

if (!url.startsWith('https://')) {
  console.error(`
[brand icon] granite.config.ts brand.icon must be the console logo URL (https://...).

1. Upload apps/umbrella/assets/logo.png to Toss console (App info → App logo).
2. Right-click the uploaded logo → copy image address.
3. Paste into apps/umbrella/granite.config.ts → BRAND_ICON_URL
4. npm run build

Local paths like assets/logo.png are rejected by review.
`);
  process.exit(1);
}

console.log('[brand icon] OK:', url.slice(0, 60) + (url.length > 60 ? '…' : ''));
