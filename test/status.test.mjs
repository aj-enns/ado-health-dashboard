import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, emptySnapshot, freshness, STALE_MS, selectCells, validateSnapshot, API_URL } from '../lib/status.mjs';
import { collect } from '../scripts/collect.mjs';

const payload = () => ({
  status: { health: 'healthy', message: 'Everything is looking good' },
  services: [
    { id: 'Pipelines', geographies: [{ id: 'US', name: 'United States', health: 'healthy' }, { id: 'EU', name: 'Europe', health: 'degraded' }] },
    { id: 'Boards', geographies: [{ id: 'US', name: 'United States', health: 'advisory' }] }
  ]
});
const now = () => new Date('2026-01-01T00:00:00.000Z');
const success = async value => collect({ fetcher: async () => new Response(JSON.stringify(value)), now });

test('normalizes documented service/geography contract and optional source time', () => {
  const value = normalize(payload());
  assert.equal(value.status.health, 'healthy');
  assert.equal(value.sourceUpdatedAt, null);
  assert.equal(value.services[0].geographies[1].health, 'degraded');
});
test('unknown health values never become healthy', () => {
  const value = payload();
  value.status.health = 'future-state';
  value.services[0].geographies[0].health = undefined;
  const result = normalize(value);
  assert.equal(result.status.health, 'unknown');
  assert.equal(result.services[0].geographies[0].health, 'unknown');
});
test('preserves all documented severity values', () => {
  for (const severity of ['healthy', 'advisory', 'degraded', 'unhealthy', 'unknown']) {
    const value = payload();
    value.status.health = severity;
    value.services[0].geographies[0].health = severity;
    const result = normalize(value);
    assert.equal(result.status.health, severity);
    assert.equal(result.services[0].geographies[0].health, severity);
  }
});
test('rejects empty, malformed and duplicate scopes', () => {
  for (const value of [{}, { status: {}, services: [] }, { ...payload(), lastUpdated: 'yesterday' }]) {
    assert.throws(() => normalize(value));
  }
  const value = payload();
  value.services.push(value.services[0]);
  assert.throws(() => normalize(value), /Duplicate/);
});
test('filters service and geography together without changing overall status', async () => {
  const snapshot = await success(payload());
  assert.equal(selectCells(snapshot).length, 3);
  assert.equal(selectCells(snapshot, 'Pipelines', 'EU')[0].health, 'degraded');
  assert.equal(selectCells(snapshot, 'missing').length, 0);
  assert.equal(snapshot.status.health, 'healthy');
});
test('freshness switches at the exact 40 minute boundary and rejects future clocks', async () => {
  const snapshot = await success(payload());
  const start = now().getTime();
  assert.equal(freshness(snapshot, start + STALE_MS - 1), 'fresh');
  assert.equal(freshness(snapshot, start + STALE_MS), 'stale');
  assert.equal(freshness(snapshot, start - 60_001), 'stale');
  assert.equal(freshness(emptySnapshot()), 'unavailable');
});
test('collector makes one anonymous request to the exact documented endpoint', async () => {
  let calls = 0;
  const snapshot = await collect({
    now,
    fetcher: async (url, options) => {
      calls++;
      assert.equal(url, API_URL);
      assert.equal(options.headers.Authorization, undefined);
      assert.equal(options.redirect, 'error');
      return new Response(JSON.stringify(payload()));
    }
  });
  assert.equal(calls, 1);
  assert.equal(snapshot.ok, true);
  assert.equal(validateSnapshot(snapshot).collectedAt, now().toISOString());
});
test('HTTP errors, network errors, invalid JSON and malformed schema produce unknown failure snapshots', async () => {
  const fetchers = [
    async () => new Response('unavailable', { status: 503 }),
    async () => { throw new Error('network unavailable'); },
    async () => new Response('<html>not JSON</html>'),
    async () => new Response('{}')
  ];
  for (const fetcher of fetchers) {
    const snapshot = await collect({ fetcher, now });
    assert.equal(snapshot.ok, false);
    assert.equal(snapshot.status.health, 'unknown');
    assert.deepEqual(snapshot.services, []);
    assert.equal(validateSnapshot(snapshot).ok, false);
  }
});
test('invalid snapshots fail closed, including missing timestamps and schema versions', async () => {
  assert.throws(() => validateSnapshot({ schemaVersion: 99 }));
  assert.throws(() => validateSnapshot({ ...emptySnapshot(), ok: true }));
  const snapshot = await success(payload());
  assert.throws(() => validateSnapshot({ ...snapshot, collectedAt: 'invalid' }));
});
