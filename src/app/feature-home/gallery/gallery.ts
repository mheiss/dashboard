import { AsyncPipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { ImageWithThumbnail } from '../../ms-graph/image.model';
import { InfiniteScrollDirective } from './scroll.directive';

@Component({
  selector: 'app-gallery',
  templateUrl: './gallery.html',
  imports: [InfiniteScrollDirective, AsyncPipe],
})
export class GalleryComponent {
  /**
   * The images to display by the component
   */
  readonly images = input.required<ImageWithThumbnail[]>();

  /**
   * Event that will be triggered when more images shall be loaded.
   */
  readonly loadMore = output();
}
