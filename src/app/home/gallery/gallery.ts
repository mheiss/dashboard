import { Component, input, output } from '@angular/core';
import { ItemWithThumbnail } from '../../graph/image.model';
import { InfiniteScrollDirective } from './scroll.directive';

@Component({
  selector: 'app-gallery',
  templateUrl: './gallery.html',
  imports: [InfiniteScrollDirective],
})
export class GalleryComponent {
  /**
   * The images to display by the component
   */
  readonly images = input.required<ItemWithThumbnail[]>();

  /**
   * Event that will be triggered when more images shall be loaded.
   */
  readonly loadMore = output();
}
