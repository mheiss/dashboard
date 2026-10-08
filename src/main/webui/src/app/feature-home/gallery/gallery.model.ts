import { signal, WritableSignal } from '@angular/core';
import { DriveImageExt } from '../../ms-graph/image.model';

/**
 * A moment containing all images of a given day.
 */
export interface Moment {
  day: number;
  images: DriveImageExt[];
  poster: WritableSignal<DriveImageExt>;
}
/**
 * Converts the given day and images into the moment structure
 */
export const toMoment = ([day, images]: [number, DriveImageExt[]]) => ({ day, poster: signal(images[0]), images });
