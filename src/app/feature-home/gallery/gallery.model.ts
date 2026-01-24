import { Signal } from '@angular/core';
import { DriveImage, DriveImageExt } from '../../ms-graph/image.model';

/**
 * Data for the detail viewer.
 */
export interface DetailViewerData {
  image: DriveImageExt;
  images: Signal<DriveImageExt[]>;
  imageCount: number;
  loadMore: () => void;
}

/**
 * A moment containing all images of a given day.
 */
export interface Moment {
  day: number;
  images: DriveImageExt[];
}
