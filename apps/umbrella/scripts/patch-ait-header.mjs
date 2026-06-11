import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppsInTossBundle } from '@apps-in-toss/ait-format';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const aitPath = path.join(root, 'umbrella.ait');

if (!fs.existsSync(aitPath)) {
  console.warn('[patch-ait-header] umbrella.ait not found, skip');
  process.exit(0);
}

const buffer = fs.readFileSync(aitPath);
const format = AppsInTossBundle.detect(buffer);

if (format === AppsInTossBundle.Format.ZIP) {
  console.error(
    '[patch-ait-header] plain ZIP detected — re-run `ait build` (do not upload this file)',
  );
  process.exit(1);
}

if (format !== AppsInTossBundle.Format.AIT) {
  console.error(`[patch-ait-header] unknown format: ${format}`);
  process.exit(1);
}

const reader = AppsInTossBundle.reader(buffer);
const metadata = reader.metadata;

const writer = AppsInTossBundle.writer({
  deploymentId: reader.deploymentId,
  appName: reader.appName,
  createdBy: reader.bundle.createdBy || '@apps-in-toss/plugins',
});

writer.setMetadata({
  isGame: metadata?.isGame ?? false,
  platform: metadata?.platform,
  runtimeVersion: metadata?.runtimeVersion ?? '',
  bundleFiles: metadata?.bundleFiles ? [...metadata.bundleFiles] : [],
  packageJson: metadata?.packageJson,
  sdkVersion: metadata?.sdkVersion ?? '',
  extra: metadata?.extra,
});

for (const permission of reader.permissions) {
  writer.addPermission(permission.name, permission.access);
}

let changed = 0;
for (const name of reader.listEntries()) {
  let data = await reader.readEntry(name);

  if (name.endsWith('.js') && !name.endsWith('.js.map')) {
    const text = Buffer.from(data).toString('utf8');
    if (text.includes('headerShown: false')) {
      data = Buffer.from(text.replaceAll('headerShown: false', 'headerShown: true'), 'utf8');
      changed += 1;
    }
  }

  writer.addFile(name, data);
}

const signature = reader.readSignature();
if (signature) {
  writer.setSignature(signature);
}

const next = await writer.toBuffer();
fs.writeFileSync(aitPath, next);

const verify = AppsInTossBundle.reader(next);
console.log(`[patch-ait-header] patched ${changed} bundle file(s)`);
console.log(`[patch-ait-header] deploymentId: ${verify.deploymentId}`);
