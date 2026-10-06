import { Signal } from '@angular/core';
import { Observable } from 'rxjs';

/**
 * Represents an image in the viewer, including its metadata and image data streams.
 */
export interface ViewerImage {
  id: string;
  name: string;
  takenAt: Date;
  original$: Observable<Blob | null>;
  thumbnail$: Observable<Blob | null>;
}

/**
 * Data required to initialize the image viewer component.
 */
export interface ImageViewerData {
  image: ViewerImage;
  images: Signal<ViewerImage[]>;
  imageCount: number;
  loadMore: () => void;
}
