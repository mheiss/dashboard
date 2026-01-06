import { Signal } from '@angular/core';
import { ImageWithThumbnail } from '../../ms-graph/image.model';

/**
 * Data for the detail viewer.
 */
export interface DetailViewerData {
  image: Signal<ImageWithThumbnail | null>;
  onNext: () => void;
  onPrevious: () => void;
  hasNext: () => boolean;
  hasPrevious: () => boolean;
}
