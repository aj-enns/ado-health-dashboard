import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { emptySnapshot } from '../lib/status.mjs';

test('build produces self-contained HTML and fails closed on invalid snapshot data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ado-health-build-'));
  try {
    for (const folder of ['site', 'lib', 'scripts']) {
      await cp(new URL(`../${folder}`, import.meta.url), join(directory, folder), { recursive: true });
    }
    const build = () => execFileSync(process.execPath, [join(directory, 'scripts', 'build.mjs')], { encoding: 'utf8', stdio: 'pipe' });
    build();
    const html = await readFile(join(directory, 'dist', 'index.html'), 'utf8');
    assert.ok(html.includes('<style>'));
    assert.ok(html.includes('<script type="module">'));
    assert.ok(!html.includes('src="app.mjs"'));
    assert.ok(!html.includes('href="style.css"'));
    assert.ok(!html.includes("from '../lib/status.mjs'"));
    const snapshot = JSON.parse(await readFile(join(directory, 'dist', 'data', 'status.json'), 'utf8'));
    assert.equal(snapshot.ok, false);
    assert.equal(snapshot.status.health, 'unknown');
    await mkdir(join(directory, 'data'), { recursive: true });
    await writeFile(join(directory, 'data', 'status.json'), JSON.stringify(emptySnapshot('API unavailable')));
    build();
    assert.equal(JSON.parse(await readFile(join(directory, 'dist', 'data', 'status.json'), 'utf8')).error, 'API unavailable');
    await writeFile(join(directory, 'data', 'status.json'), '{"schemaVersion":99}');
    assert.throws(build);
    const failingFetch = 'data:text/javascript,globalThis.fetch=async()=>new Response("unavailable",{status:503});';
    assert.throws(
      () => execFileSync(process.execPath, ['--import', failingFetch, join(directory, 'scripts', 'collect.mjs')], { stdio: 'pipe' }),
      error => error.status === 1
    );
    const failed = JSON.parse(await readFile(join(directory, 'data', 'status.json'), 'utf8'));
    assert.equal(failed.ok, false);
    assert.equal(failed.status.health, 'unknown');
    build();
    assert.equal(JSON.parse(await readFile(join(directory, 'dist', 'data', 'status.json'), 'utf8')).ok, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
