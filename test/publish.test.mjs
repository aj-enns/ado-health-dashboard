import test from 'node:test';
import assert from 'node:assert/strict';
import { pollAndPublish } from '../lib/publish.mjs';
import { emptySnapshot } from '../lib/status.mjs';

const timestamp = Date.parse('2026-01-01T00:00:00Z');
const healthy = () => ({
  schemaVersion: 1,
  ok: true,
  collectedAt: new Date(timestamp).toISOString(),
  sourceUpdatedAt: null,
  status: { health: 'healthy', message: 'Healthy' },
  services: [{ id: 'Boards', geographies: [{ id: 'US', name: 'United States', health: 'healthy' }] }]
});
function adapters(overrides = {}) {
  const writes = [];
  const logs = [];
  return {
    writes, logs,
    readSnapshot: async () => null,
    collectSnapshot: async () => healthy(),
    writeSnapshot: async snapshot => { writes.push(snapshot); },
    now: () => timestamp,
    context: { log: (...args) => logs.push(args), warn: (...args) => logs.push(args), error: (...args) => logs.push(args) },
    ...overrides
  };
}
test('publishes the same normalized snapshot contract as GitHub Pages', async () => {
  const options = adapters();
  const result = await pollAndPublish(options);
  assert.equal(result.skipped, false);
  assert.equal(options.writes.length, 1);
  assert.equal(options.writes[0].status.health, 'healthy');
});
test('publishes API failure as unknown before failing the invocation', async () => {
  const options = adapters({
    collectSnapshot: async () => ({ ...emptySnapshot('API unavailable'), collectedAt: new Date(timestamp).toISOString() })
  });
  await assert.rejects(pollAndPublish(options), /unavailable snapshot was published/);
  assert.equal(options.writes.length, 1);
  assert.equal(options.writes[0].status.health, 'unknown');
});
test('does not issue another API request less than 60 seconds after either success or failure', async () => {
  for (const previous of [healthy(), { ...emptySnapshot('failed'), collectedAt: new Date(timestamp).toISOString() }]) {
    const options = adapters({
      readSnapshot: async () => previous,
      now: () => timestamp + 59_999,
      collectSnapshot: () => { throw new Error('Unexpected API call'); }
    });
    assert.deepEqual(await pollAndPublish(options), { skipped: true });
    assert.equal(options.writes.length, 0);
  }
});
test('allows a request at the exact 60 second boundary', async () => {
  const options = adapters({ readSnapshot: async () => healthy(), now: () => timestamp + 60_000 });
  assert.equal((await pollAndPublish(options)).skipped, false);
});
test('does not let a future timestamp suppress all subsequent checks', async () => {
  const options = adapters({ readSnapshot: async () => healthy(), now: () => timestamp - 60_000 });
  assert.equal((await pollAndPublish(options)).skipped, false);
});
test('replaces malformed previous snapshots with an explicit warning', async () => {
  const options = adapters({ readSnapshot: async () => ({ schemaVersion: 99 }), isPastDue: true });
  await pollAndPublish(options);
  assert.ok(options.logs.some(args => args.join(' ').includes('running late')));
  assert.ok(options.logs.some(args => args.join(' ').includes('invalid')));
  assert.equal(options.writes.length, 1);
});
test('storage read and write failures propagate, never report publishing success', async () => {
  await assert.rejects(pollAndPublish(adapters({
    readSnapshot: async () => { throw new Error('Storage read unavailable'); },
    collectSnapshot: () => { throw new Error('Must not query API after storage failure'); }
  })), /Storage read unavailable/);
  await assert.rejects(pollAndPublish(adapters({
    writeSnapshot: async () => { throw new Error('Storage write unavailable'); }
  })), /Storage write unavailable/);
});
