import { openDB } from 'idb';
import { StoredMotionSnapshot } from '../feature-protect/motion.model';
const db = await openDB('Dashboard', 4, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('motionEvents')) {
      const motionEvents = db.createObjectStore('motionEvents', { keyPath: 'id' });
      motionEvents.createIndex('timestamp', 'timestamp');
    }
  },
});

/**
 * Reads all stored motion snapshots from the local database.
 */
export async function loadMotionSnapshots(): Promise<StoredMotionSnapshot[]> {
  return db.getAll('motionEvents');
}

/**
 * Saves a motion snapshot to the local database and removes any snapshots older than the specified timestamp.
 */
export async function saveMotionSnapshot(snapshot: StoredMotionSnapshot, oldestTimestamp: number): Promise<void> {
  const tx = db.transaction('motionEvents', 'readwrite');
  await tx.store.put(snapshot);
  let cursor = await tx.store.index('timestamp').openCursor(IDBKeyRange.upperBound(oldestTimestamp, true));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}
