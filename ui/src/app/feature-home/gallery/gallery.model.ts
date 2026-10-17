import { WritableSignal } from '@angular/core';
import { ViewerImage } from '../../image-viewer/image-viewer.model';

/**
 * A moment containing all images of a given day.
 */
export interface Moment {
  date: string;
  day: number;
  images: ViewerImage[];
  poster: WritableSignal<ViewerImage>;
}
