import { mkdir, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const target = new URL('azure/functions/', root);
execFileSync(process.execPath, [fileURLToPath(new URL('scripts/build.mjs', root))], { stdio: 'inherit' });
for (const directory of ['shared/lib/', 'shared/scripts/', 'public/']) {
  await mkdir(new URL(directory, target), { recursive: true });
}
await Promise.all([
  ...['status.mjs', 'publish.mjs'].map(name => copyFile(new URL(`lib/${name}`, root), new URL(`shared/lib/${name}`, target))),
  copyFile(new URL('scripts/collect.mjs', root), new URL('shared/scripts/collect.mjs', target)),
  copyFile(new URL('dist/index.html', root), new URL('public/index.html', target))
]);
console.log('Prepared shared collector and dashboard for the optional Functions deployment.');
