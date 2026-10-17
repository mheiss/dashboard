import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { AsyncPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideImages } from '@lucide/angular';
import { filter, interval, map } from 'rxjs';
import { BlobSrcDirective } from '../../image-viewer/blob.directive';
import { ImageViewerComponent } from '../../image-viewer/image-viewer';
import { ImageViewerData, ViewerImage } from '../../image-viewer/image-viewer.model';
import { ImageService } from './image.service';
import { PopupService } from '../../popup/popup.service';
import { DebugService } from '../../utils/debug.service';
import { LayoutService } from '../../utils/layout.service';
import { VisibilityService } from '../../utils/visibility.service';
import { Moment } from './gallery.model';

@Component({
  selector: 'app-gallery',
  templateUrl: './gallery.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [ScrollingModule, AsyncPipe, DatePipe, BlobSrcDirective, LucideImages],
})
export class GalleryComponent implements OnInit {
  readonly dialog = inject(PopupService);
  readonly layout = inject(LayoutService);
  readonly service = inject(ImageService);
  readonly visibility = inject(VisibilityService);
  readonly debug = inject(DebugService);

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
    return this.layout.desktop$() ? 3 : 2;
  });

  /**
   * Computes the rows based on the column count
   */
  readonly rows = computed(() => {
    const cols = this.columns();
    const items = this.images();
    const result: ViewerImage[][] = [];
    for (let i = 0; i < items.length; i += cols) {
      result.push(items.slice(i, i + cols));
    }
    return result;
  });

  /**
   * Returns the moments grouped by day
   */
  readonly momentsByDay = this.service.moments.asReadonly();

  constructor() {
    const every15Seconds = 15 * 1000;
    interval(every15Seconds)
      .pipe(takeUntilDestroyed(), this.visibility.skipWhenHidden())
      .subscribe(() => this.updateMomentPoster());

    // immediate refresh after resume to avoid stale data
    this.visibility.screenOnAgain$.pipe(takeUntilDestroyed()).subscribe(() => void this.service.refreshImages());
  }

  ngOnInit(): void {
    this.gallery()
      .renderedRangeStream.pipe(
        map((range) => range.end),
        map((end) => end * this.columns()),
        filter((end) => end >= this.images().length - 10),
      )
      .subscribe(() => this.service.loadMore());
  }

  trackByImageIds(_: number, row: ViewerImage[]) {
    return row.map((image) => image.id).join('|');
  }

  updateMomentPoster(): void {
    this.debug.log('Updating moment posters');
    for (const moment of this.momentsByDay()) {
      const nextPoster = Math.floor(Math.random() * moment.images.length);
      moment.poster.set(moment.images[nextPoster]);
    }
  }

  openDetailView(image: ViewerImage) {
    this.dialog.open(ImageViewerComponent, {
      data: {
        image,
        imageCount: this.imageCount(),
        images: this.images,
        loadMore: () => this.service.loadMore(),
      } satisfies ImageViewerData,
      disableClose: false,
      fullScreen: true,
    });
  }

  openMomentView(moment: Moment) {
    this.dialog.open(ImageViewerComponent, {
      data: {
        image: moment.poster(),
        imageCount: moment.images.length,
        images: signal(moment.images),
        loadMore: () => {},
      } satisfies ImageViewerData,
      disableClose: false,
      fullScreen: true,
    });
  }
}
