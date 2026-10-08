import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { AsyncPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal, Signal, viewChild, ChangeDetectionStrategy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter, interval, map, tap } from 'rxjs';
import { DriveImageExt } from '../../ms-graph/image.model';
import { ImageService } from '../../ms-graph/image.service';
import { PopupService } from '../../popup/popup.service';
import { LayoutService } from '../../utils/layout.service';
import { VisibilityService } from '../../utils/visibility.service';
import { DebugService } from '../../utils/debug.service';
import { BlobSrcDirective } from '../../image-viewer/blob.directive';
import { ImageViewerComponent } from '../../image-viewer/image-viewer';
import { ImageViewerData, ViewerImage } from '../../image-viewer/image-viewer.model';
import { Moment, toMoment } from './gallery.model';
import { LucideImages } from '@lucide/angular';

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
  private readonly viewerImageCache = new WeakMap<DriveImageExt, ViewerImage>();
  private readonly viewerImages = computed(() => this.images().map((image) => this.toViewerImage(image)));

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
    return Array.from(grouped.entries()).map(toMoment);
  });

  constructor() {
    const everyHour = 60 * 60 * 1000;
    interval(everyHour)
      .pipe(takeUntilDestroyed(), this.visibility.skipWhenHidden())
      .subscribe(() => this.service.refreshImages());

    const every15Seconds = 15 * 1000;
    interval(every15Seconds)
      .pipe(takeUntilDestroyed(), this.visibility.skipWhenHidden())
      .subscribe(() => this.updateMomentPoster());

    // immediate refresh after resume to avoid stale data
    this.visibility.screenOnAgain$.pipe(takeUntilDestroyed()).subscribe(async () => {
      this.service.refreshImages();
    });
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

  trackByImageIds(_: number, row: DriveImageExt[]) {
    return row.map((imageExt) => imageExt.image.id).join('|');
  }

  updateMomentPoster(): void {
    this.debug.log('Updating moment posters');
    for (const moment of this.momentsByDay()) {
      const nextPoster = Math.floor(Math.random() * moment.images.length);
      moment.poster.set(moment.images[nextPoster]);
    }
  }

  openDetailView(image: DriveImageExt) {
    this.dialog.open(ImageViewerComponent, {
      data: {
        image: this.toViewerImage(image),
        imageCount: this.imageCount(),
        images: this.viewerImages,
        loadMore: () => this.service.loadMore(),
      } satisfies ImageViewerData,
      disableClose: false,
      fullScreen: true,
    });
  }

  openMomentView(moment: Moment) {
    this.dialog.open(ImageViewerComponent, {
      data: {
        image: this.toViewerImage(moment.poster()),
        imageCount: moment.images.length,
        images: signal(moment.images.map((image) => this.toViewerImage(image))),
        loadMore: () => {},
      } satisfies ImageViewerData,
      disableClose: false,
      fullScreen: true,
    });
  }

  private toViewerImage(source: DriveImageExt): ViewerImage {
    let image = this.viewerImageCache.get(source);
    if (!image) {
      image = {
        id: source.image.id,
        name: source.image.name,
        takenAt: new Date(source.image.takenAt.date),
        thumbnail$: source.thumbnail$,
        original$: source.original$,
      };
      this.viewerImageCache.set(source, image);
    }
    return image;
  }
}
