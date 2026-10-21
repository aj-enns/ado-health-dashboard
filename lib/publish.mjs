import { collect } from '../scripts/collect.mjs';
import { validateSnapshot } from './status.mjs';

export async function pollAndPublish({
  readSnapshot,
  writeSnapshot,
  collectSnapshot = collect,
  now = Date.now,
  context = console,
  isPastDue = false
}) {
  if (isPastDue) context.warn('The scheduled status check is running late.');
  const previous = await readSnapshot();
  if (previous !== null) {
    let checked;
    try {
      checked = validateSnapshot(previous);
    } catch (error) {
      context.warn('Previous snapshot is invalid; collecting a replacement:', error.message);
    }
    const elapsed = now() - Date.parse(checked?.collectedAt);
    if (elapsed >= 0 && elapsed < 60_000) {
      context.log('Skipping API request: the previous check was less than 60 seconds ago.');
      return { skipped: true };
    }
  }
  const snapshot = validateSnapshot(await collectSnapshot({ logger: context }));
  await writeSnapshot(snapshot);
  if (!snapshot.ok) {
    throw new Error('Public status API collection failed. An explicit unavailable snapshot was published.');
  }
  context.log(`Published status snapshot checked at ${snapshot.collectedAt}.`);
  return { skipped: false, snapshot };
}
