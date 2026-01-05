import { openDB } from 'idb';
import { CalendarView } from '../ms-graph/calendar.model';
import { DriveImage } from './image.model';

export const db = await openDB('Dashboard', 1, {
  upgrade(db) {
    // Store for images
    const images = db.createObjectStore('images', { keyPath: 'id' });
    images.createIndex('takenAt', 'takenAt');

    // Store for metadata (delta link, version, etc.)
    db.createObjectStore('metadata', { keyPath: 'key' });
  },
});

/**
 * Loads the top 100 newest images
 */
export async function loadImages(lastKey: IDBValidKey | null) {
  const tx = db.transaction('images', 'readonly');
  const index = tx.store.index('takenAt');

  let cursor;
  if (lastKey === undefined || lastKey === null) {
    cursor = await index.openCursor(null, 'prev');
  } else {
    cursor = await index.openCursor(IDBKeyRange.upperBound(lastKey, true), 'prev');
  }

  const results: DriveImage[] = [];
  while (cursor && results.length < 100) {
    results.push(cursor.value);
    cursor = await cursor.continue();
  }

  await tx.done;

  return {
    items: results,
    lastKey: cursor?.key ?? null,
  };
}

/**
 * Stores the given item in the local database
 */
export async function saveImage(image: DriveImage) {
  await db.put('images', image);
}

/**
 * Removes the given item in the local database
 */
export async function removeImage(id: string) {
  await db.delete('images', id);
}

/**
 * Stores the delta link to get new image
 */
export async function saveDeltaLink(deltaLink: string) {
  await db.put('metadata', { key: 'images.deltaLink', value: deltaLink });
}

/**
 * Returns the delta link to get new images
 */
export async function getDeltaLink(): Promise<string | null> {
  const entry = await db.get('metadata', 'images.deltaLink');
  return entry?.value ?? null;
}

/**
 * Stores the calendar preferences
 */
export async function saveCalendarView(view: CalendarView) {
  await db.put('metadata', { key: 'calendar.view', value: view });
}

/**
 * Loads the calendar preferences
 */
export async function getCalendarView(): Promise<string | null> {
  const entry = await db.get('metadata', 'calendar.view');
  return entry?.value ?? null;
}
