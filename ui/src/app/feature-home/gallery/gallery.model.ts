import { ViewerImage } from '../../image-viewer/image-viewer.model';

export interface MemoryDay {
  month: number;
  day: number;
  days: { month: number; day: number; images: ViewerImage[]; count: number; endCursor: string | null; hasNextPage: boolean }[];
}
