import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { emptySnapshot, validateSnapshot } from '../lib/status.mjs';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const [template, css, model, app] = await Promise.all([
  read('site/index.html'), read('site/style.css'), read('lib/status.mjs'), read('site/app.mjs')
]);
const script = `${model.replace(/^export /gm, '')}\n${app.replace(/^import .*;\r?\n/, '')}`;
const html = template.replace('<link rel="stylesheet" href="style.css">', `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="app.mjs"></script>', `<script type="module">\n${script}\n</script>`);
let snapshot;
try {
  snapshot = validateSnapshot(JSON.parse(await read('data/status.json')));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  console.warn('No snapshot found; building an explicit unavailable state. Run npm run collect for live data.');
  snapshot = emptySnapshot();
}
await mkdir(new URL('dist/data/', root), { recursive: true });
await Promise.all([
  writeFile(new URL('dist/index.html', root), html),
  writeFile(new URL('dist/data/status.json', root), `${JSON.stringify(snapshot, null, 2)}\n`),
  writeFile(new URL('dist/.nojekyll', root), '')
]);
console.log('Built dist/index.html and dist/data/status.json');
