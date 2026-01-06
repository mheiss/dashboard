import { Signal } from '@angular/core';
import { ImageWithThumbnail } from '../../ms-graph/image.model';

/**
 * Data for the detail viewer.
 */
export interface DetailViewerData {
  image: ImageWithThumbnail;
  images: Signal<ImageWithThumbnail[]>;
  imageCount: number;
  loadMore: () => void;
}
