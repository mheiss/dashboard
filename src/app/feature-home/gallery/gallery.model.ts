import { Signal } from '@angular/core';
import { DriveImageExt } from '../../ms-graph/image.model';

/**
 * Data for the detail viewer.
 */
export interface DetailViewerData {
  image: DriveImageExt;
  images: Signal<DriveImageExt[]>;
  imageCount: number;
  loadMore: () => void;
}
