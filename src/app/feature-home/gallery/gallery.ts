import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal, Signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter, interval, map, tap } from 'rxjs';
import { DriveImageExt } from '../../ms-graph/image.model';
import { ImageService } from '../../ms-graph/image.service';
import { PopupService } from '../../popup/popup.service';
import { LayoutService } from '../../utils/layout.service';
import { BlobSrcDirective } from './blob.directive';
import { DetailViewerComponent } from './detail-viewer/detail-viewer';
import { DetailViewerData, Moment } from './gallery.model';

@Component({
  selector: 'app-gallery',
  templateUrl: './gallery.html',
  imports: [ScrollingModule, AsyncPipe, BlobSrcDirective],
})
export class GalleryComponent implements OnInit {
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
    return 4;
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

  /**
   * Returns the moments grouped by day
   */
  readonly momentsByDay: Signal<Moment[]> = computed(() => {
    const moments = this.service.moments.asReadonly();
    const grouped = new Map<number, DriveImageExt[]>();
    for (const imageExt of moments()) {
      const day = imageExt.image.takenAt.day;
      let images = grouped.get(day);
      if (!images) {
        images = [];
        grouped.set(day, images);
      }
      images.push(imageExt);
    }
    return Array.from(grouped.entries()).map(([day, images]) => ({ day, images }));
  });

  constructor() {
    const oncePerHour = 60 * 60 * 1000;
    interval(oncePerHour)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.service.refreshImages());
  }

  ngOnInit(): void {
    this.gallery()
      .renderedRangeStream.pipe(
        map((range) => range.end),
        map((end) => end * this.columns()),
        filter((end) => end >= this.images().length - 10),
        tap((end) => console.log('%s -> %s', end, this.images().length)),
      )
      .subscribe(() => this.service.loadMore());
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

  openMomentView(moment: Moment) {
    this.dialog.open(DetailViewerComponent, {
      data: {
        image: moment.images[0],
        imageCount: moment.images.length,
        images: signal(moment.images),
        loadMore: () => {},
      } as DetailViewerData,
      disableClose: false,
      width: '85%',
    });
  }
}
