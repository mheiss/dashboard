import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, OnInit, output, viewChild } from '@angular/core';
import { DriveImageExt } from '../../ms-graph/image.model';
import { PopupService } from '../../popup/popup.service';
import { LayoutService } from '../../utils/layout.service';
import { BlobSrcDirective } from './blob.directive';
import { DetailViewerComponent } from './detail-viewer/detail-viewer';
import { DetailViewerData } from './gallery.model';

@Component({
  selector: 'app-gallery',
  templateUrl: './gallery.html',
  imports: [ScrollingModule, AsyncPipe, BlobSrcDirective],
})
export class GalleryComponent implements OnInit {
  readonly dialog = inject(PopupService);
  readonly layout = inject(LayoutService);

  readonly gallery = viewChild.required<CdkVirtualScrollViewport>('gallery');

  /**
   * The images to display by the component
   */
  readonly images = input.required<DriveImageExt[]>();

  /**
   * The total number of images
   */
  readonly imageCount = input.required<number>();

  /**
   * Event that will be triggered when more images shall be loaded.
   */
  readonly loadMore = output();

  /**
   * Computes the number of columns depending on the viewport size
   */
  readonly columns = computed(() => {
    if (this.layout.mobile$()) {
      return 1;
    }
    return 3;
  });

  /**
   * Computes the rows based on the column count
   */
  readonly rows = computed(() => {
    const cols = this.columns();
    const items = this.images();
    const result: DriveImageExt[][] = [];
    for (let i = 0; i < items.length; i += cols) {
      result.push(items.slice(i, i + cols));
    }
    return result;
  });

  ngOnInit() {
    this.loadMore.emit();
  }

  openDetailView(image: DriveImageExt) {
    this.dialog.open(DetailViewerComponent, {
      data: {
        image: image,
        imageCount: this.imageCount(),
        images: this.images,
        loadMore: () => this.loadMore.emit(),
      } as DetailViewerData,
      disableClose: false,
      width: '85%',
    });
  }
}
