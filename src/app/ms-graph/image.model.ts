import { DriveItem, NullableOption } from '@microsoft/microsoft-graph-types';
import { Observable } from 'rxjs';

/**
 * The image stored in the local database
 */
export interface DriveImage {
  id: string;
  name: string;
  takenAt: DateExt;
  lastModifiedAt: DateExt;
  thumbnailBlob?: Blob;
}

/**
 * A date that additionally store the day and the month as separate properties.
 */
export interface DateExt {
  date: number;
  day: number;
  month: number;
}

/**
 * Creates a new drive image out of the given drive item.
 * Returns null if the given item is no photo at all.
 */
export const toDriveImage = (item: DriveItem): DriveImage | null => {
  if (!item.id || !item.photo) {
    return null;
  }
  const id = item.id;
  const name = item.name ? item.name : id;
  const takenAt = toDateExt(item.photo?.takenDateTime);
  const lastModifiedAt = toDateExt(item.lastModifiedDateTime);
  return {
    id,
    name,
    takenAt,
    lastModifiedAt,
  };
};

/**
 * Converts the date into the given structure.
 * A random date in the past is us used when the date is null
 */
export const toDateExt = (dateAsString: NullableOption<string> | undefined) => {
  if (dateAsString) {
    const date = new Date(dateAsString);
    return {
      date: date.getTime(),
      day: date.getDay(),
      month: date.getMonth(),
    };
  }
  return {
    date: new Date('9.9.99').getTime(),
    day: -1,
    month: -1,
  };
};

/**
 * A drive image with a thumbnail and the original size
 */
export interface DriveImageExt {
  image: DriveImage;
  original$: Observable<Blob | null>;
  thumbnail$: Observable<Blob | null>;
}
