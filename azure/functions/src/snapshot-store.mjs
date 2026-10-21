export function snapshotStore(blob, context = console) {
  return {
    readSnapshot: async () => {
      let content;
      try {
        content = (await blob.downloadToBuffer()).toString('utf8');
      } catch (error) {
        if (error.statusCode === 404 && (error.code === 'BlobNotFound' || error.details?.errorCode === 'BlobNotFound')) return null;
        throw error;
      }
      try {
        return JSON.parse(content);
      } catch (error) {
        context.warn('Published snapshot is not valid JSON; collecting a replacement:', error.message);
        return { schemaVersion: 0 };
      }
    },
    writeSnapshot: snapshot => blob.uploadData(Buffer.from(`${JSON.stringify(snapshot, null, 2)}\n`), {
      blobHTTPHeaders: {
        blobContentType: 'application/json; charset=utf-8',
        blobCacheControl: 'no-store'
      }
    })
  };
}
