import { AsyncPipe, DatePipe } from '@angular/common';
import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideCalendarDays, LucideChevronLeft, LucideChevronRight, LucideImages } from '@lucide/angular';
import { elementScroll, observeElementOffset, observeElementRect, VirtualItem, Virtualizer } from '@tanstack/virtual-core';
import { interval } from 'rxjs';
import { BackendMemoryDate } from '../../backend/backend.model';
import { BlobSrcDirective } from '../../image-viewer/blob.directive';
import { ImageViewerComponent } from '../../image-viewer/image-viewer';
import { ImageViewerData, ViewerImage } from '../../image-viewer/image-viewer.model';
import { ImageService } from './image.service';
import { MemoryBrowserComponent, MemoryBrowserData } from './memory-browser/memory-browser';
import { PopupService } from '../../popup/popup.service';
import { LayoutService } from '../../utils/layout.service';
import { VisibilityService } from '../../utils/visibility.service';

@Component({
  selector: 'app-gallery',
  templateUrl: './gallery.html',
  host: { '[style.--gallery-columns]': 'columns()' },
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [AsyncPipe, DatePipe, BlobSrcDirective, LucideCalendarDays, LucideChevronLeft, LucideChevronRight, LucideImages],
})
export class GalleryComponent {
  readonly dialog = inject(PopupService);
  readonly service = inject(ImageService);
  readonly visibility = inject(VisibilityService);
  readonly layout = inject(LayoutService);
  private readonly destroyRef = inject(DestroyRef);

  readonly gallery = viewChild<ElementRef<HTMLElement>>('gallery');
  readonly columns = computed(() => (this.layout.desktop$() ? Math.max(4, Math.floor((this.viewportWidth() + 10) / 230)) : 3));
  readonly virtualItems = signal<VirtualItem[]>([]);
  readonly totalHeight = signal(0);
  readonly memoryDate = signal<BackendMemoryDate | null>(null);
  private readonly memoryCycleOffset = signal(0);
  readonly memoryImages = computed(() => {
    const memory = this.service.selectedMemory();
    if (!memory) return [];
    if (!memory.sameDayImages.length) return memory.images;
    const offset = this.memoryCycleOffset() % memory.sameDayImages.length;
    return [memory.sameDayImages[offset], ...memory.images.slice(1)];
  });
  readonly orderedMemoryDates = computed(() => {
    const now = new Date();
    const today = this.dayOrdinal(now.getMonth() + 1, now.getDate());
    return [...this.service.memoryDates()].sort((left, right) => this.daysAgo(left, today) - this.daysAgo(right, today));
  });
  readonly selectedMemoryIndex = computed(() => {
    const selected = this.memoryDate();
    return selected ? this.orderedMemoryDates().findIndex((date) => date.month === selected.month && date.day === selected.day) : -1;
  });
  readonly canBrowseOlder = computed(
    () => this.selectedMemoryIndex() >= 0 && this.selectedMemoryIndex() < this.orderedMemoryDates().length - 1,
  );
  readonly canBrowseNewer = computed(() => this.selectedMemoryIndex() > 0);
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

  private readonly initializeMemoryDate = effect(() => {
    const dates = this.orderedMemoryDates();
    if (this.memoryDate() || !dates.length) return;
    untracked(() => this.selectMemoryDate(dates[0]));
  });

  constructor() {
    interval(15_000)
      .pipe(this.visibility.skipWhenHidden(), takeUntilDestroyed())
      .subscribe(() => this.cycleMemoryImages());

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

  browseOlderMemory(): void {
    const older = this.orderedMemoryDates()[this.selectedMemoryIndex() + 1];
    if (older) this.selectMemoryDate(older);
  }

  browseNewerMemory(): void {
    const newer = this.selectedMemoryIndex() > 0 ? this.orderedMemoryDates()[this.selectedMemoryIndex() - 1] : null;
    if (newer) this.selectMemoryDate(newer);
  }

  private cycleMemoryImages(): void {
    const memory = this.service.selectedMemory();
    if (this.service.memoryLoading() || !memory || memory.sameDayImages.length < 2) return;
    this.memoryCycleOffset.update((offset) => (offset + 1) % memory.sameDayImages.length);
  }

  selectMemoryDate(date: BackendMemoryDate): void {
    this.memoryCycleOffset.set(0);
    this.memoryDate.set(date);
    void this.service.loadMemoryDay(date, this.previousMemoryDates(date));
  }

  openMemoryBrowser(mode: MemoryBrowserData['mode']): void {
    const selected = this.memoryDate();
    const now = new Date();
    this.dialog.open(MemoryBrowserComponent, {
      data: {
        month: selected?.month ?? now.getMonth() + 1,
        day: selected?.day ?? now.getDate(),
        mode,
        onSelect: (date: BackendMemoryDate) => this.selectMemoryDate(date),
      } satisfies MemoryBrowserData,
      disableClose: false,
      width: 'min(1000px, calc(100vw - 32px))',
      height: 'min(800px, calc(100dvh - 32px))',
      fullScreen: this.layout.mobile$(),
    });
  }

  openMomentView(image: ViewerImage): void {
    const images = this.memoryImages();
    if (!images.length) return;
    this.dialog.open(ImageViewerComponent, {
      data: {
        image,
        imageCount: images.length,
        images: signal(images),
        loadMore: () => {},
      } satisfies ImageViewerData,
      disableClose: false,
      fullScreen: true,
    });
  }

  private dayOrdinal(month: number, day: number): number {
    return Date.UTC(2000, month - 1, day) / 86_400_000;
  }

  private previousMemoryDates(date: BackendMemoryDate): BackendMemoryDate[] {
    const dates = this.orderedMemoryDates();
    const selectedIndex = dates.findIndex((item) => item.month === date.month && item.day === date.day);
    if (selectedIndex < 0) return [];

    const previousDates: BackendMemoryDate[] = [];
    for (let offset = 1; offset < dates.length && previousDates.length < 3; offset++) {
      previousDates.push(dates[(selectedIndex + offset) % dates.length]);
    }
    return previousDates;
  }

  private daysAgo(date: BackendMemoryDate, todayOrdinal: number): number {
    return (todayOrdinal - this.dayOrdinal(date.month, date.day) + 366) % 366;
  }
}
