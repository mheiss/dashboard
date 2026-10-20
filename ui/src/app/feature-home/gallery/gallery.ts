import { AsyncPipe, DatePipe } from '@angular/common';
import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideImages } from '@lucide/angular';
import { elementScroll, observeElementOffset, observeElementRect, VirtualItem, Virtualizer } from '@tanstack/virtual-core';
import { interval } from 'rxjs';
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
  host: { '[style.--gallery-columns]': 'columns()' },
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [AsyncPipe, DatePipe, BlobSrcDirective, LucideImages],
})
export class GalleryComponent {
  readonly dialog = inject(PopupService);
  readonly service = inject(ImageService);
  readonly visibility = inject(VisibilityService);
  readonly debug = inject(DebugService);
  readonly layout = inject(LayoutService);
  private readonly destroyRef = inject(DestroyRef);

  readonly gallery = viewChild<ElementRef<HTMLElement>>('gallery');
  readonly columns = computed(() => (this.layout.desktop$() ? Math.max(4, Math.floor((this.viewportWidth() + 10) / 230)) : 3));
  readonly virtualItems = signal<VirtualItem[]>([]);
  readonly totalHeight = signal(0);
  private readonly viewportWidth = signal(0);
  private readonly measuredRatios = new WeakMap<ViewerImage, number>();
  private readonly virtualizer = new Virtualizer<HTMLElement, HTMLElement>({
    count: 0,
    getScrollElement: () => this.gallery()?.nativeElement ?? null,
    estimateSize: (index) => this.rowHeight(index),
    scrollToFn: elementScroll,
    observeElementRect,
    observeElementOffset,
    overscan: 3,
    onChange: (instance) => this.updateVirtualItems(instance),
  });

  /**
   * The images to display by the component
   */
  readonly images = this.service.images.asReadonly();

  /**
   * The total number of images
   */
  readonly imageCount = this.service.imageCount.asReadonly();

  /**
   * Returns the moments grouped by day
   */
  readonly momentsByDay = this.service.moments.asReadonly();

  constructor() {
    afterNextRender(() => {
      const cleanup = this.virtualizer._didMount();
      const element = this.gallery()!.nativeElement;
      const observer = new ResizeObserver(() => this.viewportWidth.set(element.clientWidth));
      observer.observe(element);
      this.viewportWidth.set(element.clientWidth);
      this.virtualizer._willUpdate();
      this.destroyRef.onDestroy(() => {
        observer.disconnect();
        cleanup();
      });
    });

    let previousColumns = 0;
    let previousWidth = 0;
    let previousImages: ViewerImage[] = [];

    afterRenderEffect(() => {
      const images = this.images();
      const columns = this.columns();
      const width = this.viewportWidth();
      this.virtualizer.setOptions({
        ...this.virtualizer.options,
        count: Math.ceil(images.length / columns),
        getItemKey: (index) => `${columns}:${images[index * columns]?.id ?? index}`,
      });
      if (columns !== previousColumns || width !== previousWidth || images !== previousImages) {
        this.virtualizer.measure();
        previousColumns = columns;
        previousWidth = width;
        previousImages = images;
      }
      this.virtualizer._willUpdate();
      this.updateVirtualItems(this.virtualizer);
    });

    afterRenderEffect(() => {
      const last = this.virtualItems().at(-1);
      const count = Math.ceil(this.images().length / this.columns());
      if (!this.service.loading() && last && last.index >= count - 3) {
        untracked(() => void this.service.loadMore());
      }
    });

    const every15Seconds = 15 * 1000;
    interval(every15Seconds)
      .pipe(takeUntilDestroyed(), this.visibility.skipWhenHidden())
      .subscribe(() => this.updateMomentPoster());

    // immediate refresh after resume to avoid stale data
    this.visibility.screenOnAgain$.pipe(takeUntilDestroyed()).subscribe(() => void this.service.refreshImages());
  }

  private updateVirtualItems(instance: Virtualizer<HTMLElement, HTMLElement>): void {
    this.virtualItems.set(instance.getVirtualItems());
    this.totalHeight.set(instance.getTotalSize());
  }

  rowImages(index: number): ViewerImage[] {
    return this.images().slice(index * this.columns(), (index + 1) * this.columns());
  }

  aspectRatio(image: ViewerImage): number {
    if (image.width && image.height && image.width > 0 && image.height > 0) return image.width / image.height;
    return this.measuredRatios.get(image) ?? 1.5;
  }

  private rowHeight(index: number): number {
    const columns = this.columns();
    const tileWidth = Math.max(1, (this.viewportWidth() - (columns - 1) * 10) / columns);
    return Math.max(...this.rowImages(index).map((image) => tileWidth / this.aspectRatio(image)), 1) + 10;
  }

  imageLoaded(image: ViewerImage, rowIndex: number, event: Event): void {
    if (image.width && image.height) return;
    const element = event.target as HTMLImageElement;
    if (element.naturalWidth && element.naturalHeight) {
      this.measuredRatios.set(image, element.naturalWidth / element.naturalHeight);
      this.virtualizer.resizeItem(rowIndex, this.rowHeight(rowIndex));
    }
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
