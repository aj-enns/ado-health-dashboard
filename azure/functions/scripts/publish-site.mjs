import { readFile } from 'node:fs/promises';
import { AzureCliCredential } from '@azure/identity';
import { BlobServiceClient } from '@azure/storage-blob';
import { emptySnapshot } from '../shared/lib/status.mjs';
import { initializeSnapshot } from '../src/bootstrap.mjs';

const endpoint = process.env.WEBSITE_STORAGE_BLOB_ENDPOINT;
if (!endpoint) throw new Error('WEBSITE_STORAGE_BLOB_ENDPOINT is required. Run through azd deploy.');
const service = new BlobServiceClient(endpoint, new AzureCliCredential(), {
  retryOptions: { maxTries: 1, tryTimeoutInMs: 20_000 }
});
const container = service.getContainerClient('$web');
await container.getBlockBlobClient('index.html').uploadData(
  await readFile(new URL('../public/index.html', import.meta.url)),
  { blobHTTPHeaders: { blobContentType: 'text/html; charset=utf-8', blobCacheControl: 'no-cache' } }
);
const created = await initializeSnapshot(
  container.getBlockBlobClient('data/status.json'),
  emptySnapshot('Waiting for the first Azure Functions status check.')
);
console.log(created
  ? 'Published an initial unknown snapshot; the next timer check will replace it.'
  : 'Retained the existing snapshot; dashboard redeployment does not overwrite health data.');
console.log('Published the dashboard to the Storage static website.');
