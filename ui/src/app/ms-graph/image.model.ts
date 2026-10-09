import { DriveItem, NullableOption } from '@microsoft/microsoft-graph-types';
import { Observable } from 'rxjs';

/**
 * The image stored in the local database
 */
export interface DriveImage {
  id: string;
  driveId: string;
  name: string;
  takenAt: DateExt;
  lastModifiedAt: DateExt;
  thumbnailBlob?: Blob;
  thumbnailUrl?: string;
  originalUrl?: string;
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
  if (!item.id || !item.parentReference?.driveId || !item.photo) {
    return null;
  }
  let id = item.id;
  let driveId = item.parentReference?.driveId;
  if (item.remoteItem?.id && item.remoteItem.parentReference?.driveId) {
    id = item.remoteItem.id;
    driveId = item.remoteItem.parentReference.driveId;
  }
  const name = item.name ? item.name : id;
  const takenAt = toDateExt(item.photo?.takenDateTime);
  const lastModifiedAt = toDateExt(item.lastModifiedDateTime);
  return {
    id,
    driveId,
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
      day: date.getDate(),
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

/**
 * Returns true when a refreshed image page contains the same images in the same order.
 */
export const containsSameImages = (currentImages: DriveImageExt[], refreshedImages: DriveImage[]) => {
  if (currentImages.length !== refreshedImages.length) {
    return false;
  }

  return currentImages.every((imageExt, index) => {
    const refreshedImage = refreshedImages[index];
    return imageExt.image.id === refreshedImage.id && imageExt.image.lastModifiedAt.date === refreshedImage.lastModifiedAt.date;
  });
};

/**
 * Creates an extended image and reuses an existing one when the stored image did not change.
 */
export const toDriveImageExt = (
  image: DriveImage,
  getThumbnail: (image: DriveImage) => Observable<Blob | null>,
  getOriginal: (image: DriveImage) => Observable<Blob | null>,
  existing?: DriveImageExt,
): DriveImageExt => {
  if (existing && existing.image.lastModifiedAt.date === image.lastModifiedAt.date) {
    return existing;
  }

  return {
    image,
    thumbnail$: getThumbnail(image),
    original$: getOriginal(image),
  };
};
