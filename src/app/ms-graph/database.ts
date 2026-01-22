import { IDBPDatabase, openDB } from 'idb';
import { from, Observable } from 'rxjs';
import { CalendarView } from '../ms-graph/calendar.model';
import { DriveImage } from './image.model';
import { DriveItem } from '@microsoft/microsoft-graph-types';

// V3:
//    + image.takenAt.Month/Day
//    + image.driveId
const db = await openDB('Dashboard', 3, {
  upgrade(db) {
    // Always drop everything, migration is not worth the effort
    if (db.objectStoreNames.contains('images')) {
      db.deleteObjectStore('images');
    }
    if (db.objectStoreNames.contains('metadata')) {
      db.deleteObjectStore('metadata');
    }

    // Store for images
    const images = db.createObjectStore('images', { keyPath: 'id' });
    images.createIndex('takenAt', 'takenAt.date');
    images.createIndex('takenAtMonthDay', ['takenAt.month', 'takenAt.day'], { unique: false });

    // Store for metadata (delta link, version, etc.)
    db.createObjectStore('metadata', { keyPath: 'key' });
  },
});

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
 * Removes the given item from the local database
 */
export async function removeImage(id: string) {
  await db.delete('images', id);
}

/**
 * Stores the delta link to get new image
 */
export async function saveDeltaLink(item: DriveItem, deltaLink: string) {
  await db.put('metadata', { key: `${item.id}.deltaLink`, value: deltaLink });
}

/**
 * Returns the delta link to get new images
 */
export async function getDeltaLink(item: DriveItem): Promise<string | null> {
  const entry = await db.get('metadata', `${item.id}.deltaLink`);
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
