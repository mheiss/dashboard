import { DriveItem } from '@microsoft/microsoft-graph-types';
import { openDB } from 'idb';
import { from, Observable } from 'rxjs';
import { CalendarView } from '../ms-graph/calendar.model';
import { DriveImage } from './image.model';
import { isSameDay, isSameYear } from '../utils/date';
import { not } from 'xstate';

// V3:
//    + image.takenAt.Month/Day
//    + image.driveId
//    ~ Index renaming
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
    images.createIndex('takenAt.date', 'takenAt.date');
    images.createIndex('takenAt.month-day', ['takenAt.month', 'takenAt.day'], { unique: false });

    // Store for metadata (delta link, version, etc.)
    db.createObjectStore('metadata', { keyPath: 'key' });
  },
});

/**
 * Loads the next images sorted by 'takenAt' timestamp
 */
export async function loadImages(count: number, lastKey: IDBValidKey | null) {
  const tx = db.transaction('images', 'readonly');
  const index = tx.store.index('takenAt.date');

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
 * Loads the moments of the given day and month.
 */
export async function loadMoments(day: number, month: number) {
  const tx = db.transaction('images', 'readonly');
  const store = tx.objectStore('images');
  const index = store.index('takenAt.month-day');

  const range = IDBKeyRange.only([month, day]);
  const request = await index.getAll(range);
  const images = request as DriveImage[];

  const today = new Date();
  const filtered = images.filter((image) => !isSameYear(today, new Date(image.takenAt.date)));
  const sorted = filtered.sort((a, b) => b.takenAt.date - a.takenAt.date);
  return sorted;
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
 * Removes the delta link as it is not valid anymore.
 */
export async function removeDeltaLink(item: DriveItem) {
  await db.delete('metadata', `${item.id}.deltaLink`);
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
