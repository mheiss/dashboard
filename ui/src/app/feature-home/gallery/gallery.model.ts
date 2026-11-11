import { ViewerImage } from '../../image-viewer/image-viewer.model';

export interface MemoryDay {
  month: number;
  day: number;
  images: ViewerImage[];
  sameDayImages: ViewerImage[];
  memoryCounts: number[];
}
