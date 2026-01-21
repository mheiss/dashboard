import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, OnInit, output, viewChild } from '@angular/core';
import { DriveImageExt } from '../../ms-graph/image.model';
import { PopupService } from '../../popup/popup.service';
import { LayoutService } from '../../utils/layout.service';
import { BlobSrcDirective } from './blob.directive';
import { DetailViewerComponent } from './detail-viewer/detail-viewer';
import { DetailViewerData } from './gallery.model';
import { ImageService } from '../../ms-graph/image.service';
import { interval } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-gallery',
  templateUrl: './gallery.html',
  imports: [ScrollingModule, AsyncPipe, BlobSrcDirective],
})
export class GalleryComponent {
  readonly dialog = inject(PopupService);
  readonly layout = inject(LayoutService);
  readonly service = inject(ImageService);

  readonly gallery = viewChild.required<CdkVirtualScrollViewport>('gallery');

  /**
   * The images to display by the component
   */
  readonly images = this.service.images.asReadonly();

  /**
   * The total number of images
   */
  readonly imageCount = this.service.imageCount.asReadonly();

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

  constructor() {
    const oncePerHour = 60 * 60 * 1000;
    interval(oncePerHour)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.service.refreshImages());
  }

  openDetailView(image: DriveImageExt) {
    this.dialog.open(DetailViewerComponent, {
      data: {
        image: image,
        imageCount: this.imageCount(),
        images: this.images,
        loadMore: () => this.service.loadMore(),
      } as DetailViewerData,
      disableClose: false,
      width: '85%',
    });
  }
}
