export async function initializeSnapshot(blob, snapshot) {
  try {
    await blob.uploadData(Buffer.from(`${JSON.stringify(snapshot, null, 2)}\n`), {
      conditions: { ifNoneMatch: '*' },
      blobHTTPHeaders: {
        blobContentType: 'application/json; charset=utf-8',
        blobCacheControl: 'no-store'
      }
    });
    return true;
  } catch (error) {
    const code = error.code ?? error.details?.errorCode;
    if ((error.statusCode === 412 && code === 'ConditionNotMet') ||
        (error.statusCode === 409 && code === 'BlobAlreadyExists')) return false;
    throw error;
  }
}
