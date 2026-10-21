import { app } from '@azure/functions';
import { DefaultAzureCredential } from '@azure/identity';
import { BlobServiceClient } from '@azure/storage-blob';
import { pollAndPublish } from '../../shared/lib/publish.mjs';
import { snapshotStore } from '../snapshot-store.mjs';

app.timer('pollStatus', {
  schedule: '%TIMER_SCHEDULE%',
  runOnStartup: false,
  useMonitor: true,
  handler: async (timer, context) => {
    const endpoint = process.env.WEBSITE_STORAGE_BLOB_ENDPOINT;
    if (!endpoint) throw new Error('WEBSITE_STORAGE_BLOB_ENDPOINT is required.');
    const credential = new DefaultAzureCredential({
      managedIdentityClientId: process.env.AZURE_CLIENT_ID
    });
    const service = new BlobServiceClient(endpoint, credential, {
      retryOptions: { maxTries: 1, tryTimeoutInMs: 20_000 }
    });
    const blob = service.getContainerClient('$web').getBlockBlobClient('data/status.json');
    await pollAndPublish({
      context,
      isPastDue: timer.isPastDue,
      ...snapshotStore(blob, context)
    });
  }
});
