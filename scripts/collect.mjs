import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { API_URL, normalize, emptySnapshot } from '../lib/status.mjs';

export async function collect({ fetcher = fetch, now = () => new Date() } = {}) {
  try {
    const response = await fetcher(API_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
      redirect: 'error'
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const normalized = normalize(await response.json());
    return {
      schemaVersion: 1, source: API_URL, collectedAt: now().toISOString(),
      ok: true, error: null, ...normalized
    };
  } catch (error) {
    // Publish an explicit failure instead of leaving an apparently healthy snapshot.
    console.error('Status collection failed:', error.message);
    return {
      ...emptySnapshot('The public status API request failed or returned an invalid response. See the Actions run for details.'),
      collectedAt: now().toISOString()
    };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const snapshot = await collect();
  const destination = new URL('../data/status.json', import.meta.url);
  await mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await writeFile(destination, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Collection ${snapshot.ok ? 'succeeded' : 'failed'} at ${snapshot.collectedAt}`);
  if (!snapshot.ok) process.exitCode = 1;
}
