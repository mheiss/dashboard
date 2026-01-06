import { IDBPDatabase, openDB } from 'idb';
import { from, Observable } from 'rxjs';
import { CalendarView } from '../ms-graph/calendar.model';
import { DriveImage } from './image.model';

const db = await openDB('Dashboard', 2, {
  upgrade(db, oldVersion) {
    migrateToLatest(db, oldVersion);

    // Store for images
    const images = db.createObjectStore('images', { keyPath: 'id' });
    images.createIndex('takenAt', 'takenAt');

    // Store for metadata (delta link, version, etc.)
    db.createObjectStore('metadata', { keyPath: 'key' });
  },
});

/**
 * Migrates the database if possible or drops it
 */
function migrateToLatest(db: IDBPDatabase<any>, oldVersion: number) {
  // Schema change: URL to blob -> Drop
  if (oldVersion < 2) {
    if (db.objectStoreNames.contains('images')) {
      db.deleteObjectStore('images');
    }
    if (db.objectStoreNames.contains('metadata')) {
      db.deleteObjectStore('metadata');
    }
  }
}

/**
 * Loads the next images sorted by 'takenAt' timestamp
 */
export async function loadImages(count: number, lastKey: IDBValidKey | null) {
  const tx = db.transaction('images', 'readonly');
  const index = tx.store.index('takenAt');

  let cursor;
  if (lastKey === undefined || lastKey === null) {
    cursor = await index.openCursor(null, 'prev');
  } else {
    cursor = await index.openCursor(IDBKeyRange.upperBound(lastKey, true), 'prev');
  }

  const results: DriveImage[] = [];
  while (cursor && results.length < count) {
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
 * Returns the total number of stored images
 */
export async function getImageCount(): Promise<number> {
  const tx = db.transaction('images', 'readonly');
  const store = tx.store;
  const request = store.count();
  return request;
}

/**
 * Stores the given item in the local database
 */
export async function saveImage(image: DriveImage) {
  await db.put('images', image);
}

/**
 * Stores the given item in the local database
 */
export function getImage(image: DriveImage) {
  return from(db.get('images', image.id)) as Observable<DriveImage | undefined>;
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
