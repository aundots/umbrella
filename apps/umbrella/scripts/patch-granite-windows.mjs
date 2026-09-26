import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(root, '..');

const replacements = [
  {
    file: '../node_modules/@granite-js/plugin-micro-frontend/dist/index.js',
    from: "import * as ${identifier} from '${path.resolve(modulePath)}';",
    to: "import * as ${identifier} from '${path.resolve(modulePath).replace(/\\\\/g, '/')}';",
  },
  {
    file: '../node_modules/@granite-js/plugin-micro-frontend/dist/index.cjs',
    from: "import * as ${identifier} from '${path.default.resolve(modulePath)}';",
    to: "import * as ${identifier} from '${path.default.resolve(modulePath).replace(/\\\\/g, '/')}';",
  },
  {
    file: '../node_modules/@apps-in-toss/plugin-compat/dist/index.js',
    from: `const reactUsePolyfillPath = __require.resolve("react18-use");
  const reactEffectEventPolyfillPath = __require.resolve("use-effect-event");`,
    to: `const reactUsePolyfillPath = __require.resolve("react18-use").replace(/\\\\/g, '/');
  const reactEffectEventPolyfillPath = __require.resolve("use-effect-event").replace(/\\\\/g, '/');`,
  },
  {
    file: '../node_modules/@apps-in-toss/plugin-compat/dist/index.cjs',
    from: `const reactUsePolyfillPath = require.resolve("react18-use");
  const reactEffectEventPolyfillPath = require.resolve("use-effect-event");`,
    to: `const reactUsePolyfillPath = require.resolve("react18-use").replace(/\\\\/g, '/');
  const reactEffectEventPolyfillPath = require.resolve("use-effect-event").replace(/\\\\/g, '/');`,
  },
];

function patchFile(rel, from, to) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    console.warn(`skip missing: ${file}`);
    return false;
  }

  const src = fs.readFileSync(file, 'utf8');
  if (src.includes(to)) return false;
  if (!src.includes(from)) return false;

  fs.writeFileSync(file, src.replace(from, to));
  console.log(`patched ${path.basename(file)}`);
  return true;
}

let patched = 0;
for (const item of replacements) {
  if (patchFile(item.file, item.from, item.to)) patched += 1;
}

const graniteDir = path.join(appRoot, '.granite');
if (fs.existsSync(graniteDir)) {
  fs.rmSync(graniteDir, { recursive: true, force: true });
  console.log('cleared .granite cache');
}

if (patched === 0) {
  console.log('Windows build patches already applied');
}
