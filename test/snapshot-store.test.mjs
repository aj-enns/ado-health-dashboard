import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotStore } from '../azure/functions/src/snapshot-store.mjs';
import { initializeSnapshot } from '../azure/functions/src/bootstrap.mjs';

test('Blob adapter handles only an absent blob as initial state, not permissions or network failures', async () => {
  const blob = error => ({ downloadToBuffer: async () => { throw error; } });
  assert.equal(await snapshotStore(blob({ statusCode: 404, code: 'BlobNotFound' })).readSnapshot(), null);
  assert.equal(await snapshotStore(blob({ statusCode: 404, details: { errorCode: 'BlobNotFound' } })).readSnapshot(), null);
  for (const error of [{ statusCode: 403, code: 'AuthorizationFailure' }, { statusCode: 404, code: 'ContainerNotFound' }, new Error('Network failure')]) {
    await assert.rejects(snapshotStore(blob(error)).readSnapshot(), candidate => candidate === error);
  }
});
test('bootstrap uses a conditional create and preserves an existing live snapshot', async () => {
  let condition;
  assert.equal(await initializeSnapshot({ uploadData: async (_, options) => { condition = options.conditions; } }, { ok: false }), true);
  assert.deepEqual(condition, { ifNoneMatch: '*' });
  for (const error of [
    { statusCode: 412, code: 'ConditionNotMet' },
    { statusCode: 412, details: { errorCode: 'ConditionNotMet' } },
    { statusCode: 409, code: 'BlobAlreadyExists' }
  ]) {
    assert.equal(await initializeSnapshot({ uploadData: async () => { throw error; } }, {}), false);
  }
  await assert.rejects(initializeSnapshot({
    uploadData: async () => { throw new Error('Permission denied'); }
  }, {}), /Permission denied/);
});
test('Blob adapter parses public JSON and explicitly reports malformed content for replacement', async () => {
  const valid = snapshotStore({ downloadToBuffer: async () => Buffer.from('{"schemaVersion":1}') });
  assert.deepEqual(await valid.readSnapshot(), { schemaVersion: 1 });
  const warnings = [];
  const invalid = snapshotStore(
    { downloadToBuffer: async () => Buffer.from('not JSON') },
    { warn: (...args) => warnings.push(args) }
  );
  assert.deepEqual(await invalid.readSnapshot(), { schemaVersion: 0 });
  assert.equal(warnings.length, 1);
});
test('Blob adapter atomically uploads JSON with content type and no-store caching', async () => {
  let uploaded;
  const store = snapshotStore({ uploadData: async (body, options) => { uploaded = { body, options }; } });
  await store.writeSnapshot({ ok: false, status: { health: 'unknown' } });
  assert.equal(JSON.parse(uploaded.body.toString()).status.health, 'unknown');
  assert.equal(uploaded.options.blobHTTPHeaders.blobContentType, 'application/json; charset=utf-8');
  assert.equal(uploaded.options.blobHTTPHeaders.blobCacheControl, 'no-store');
});
