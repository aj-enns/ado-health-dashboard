import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
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

test('Functions packaging copies shared code without duplicating implementation or bundling a live snapshot', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ado-functions-build-'));
  try {
    for (const folder of ['site', 'lib', 'scripts']) {
      await cp(new URL(`../${folder}`, import.meta.url), join(directory, folder), { recursive: true });
    }
    execFileSync(process.execPath, [join(directory, 'scripts', 'prepare-functions.mjs')], { stdio: 'pipe' });
    const functions = join(directory, 'azure', 'functions');
    for (const name of ['status.mjs', 'publish.mjs']) {
      assert.equal(
        await readFile(join(functions, 'shared', 'lib', name), 'utf8'),
        await readFile(new URL(`../lib/${name}`, import.meta.url), 'utf8')
      );
    }
    const staged = await import(pathToFileURL(join(functions, 'shared', 'lib', 'publish.mjs')).href);
    assert.equal(typeof staged.pollAndPublish, 'function');
    const html = await readFile(join(functions, 'public', 'index.html'), 'utf8');
    assert.ok(html.includes('data/status.json'));
    assert.ok(!html.includes('only Actions queries the API'));
    await assert.rejects(readFile(join(functions, 'public', 'data', 'status.json')), { code: 'ENOENT' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
