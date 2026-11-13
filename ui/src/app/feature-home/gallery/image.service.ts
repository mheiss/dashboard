import { inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, defer, filter, of, ReplaySubject, share } from 'rxjs';
import { BackendImage, BackendMemoryDate, IMAGE_FIELDS, ImagePage } from '../../backend/backend.model';
import { BackendService } from '../../backend/backend.service';
import { MediaService } from '../../backend/generated/services/media.service';
import { MemoryDay } from './gallery.model';
import { ViewerImage } from '../../image-viewer/image-viewer.model';

@Injectable({ providedIn: 'root' })
export class ImageService {
  private readonly backend = inject(BackendService);
  private readonly media = inject(MediaService);
  readonly loading = signal(false);
  readonly images = signal<ViewerImage[]>([]);
  readonly memoryDates = signal<BackendMemoryDate[]>([]);
  readonly memoryYears = signal<number[]>([]);
  readonly selectedMemory = signal<MemoryDay | null>(null);
  readonly archiveDates = signal<BackendMemoryDate[]>([]);
  readonly imageCount = signal(0);
  readonly error = signal<string | null>(null);
  readonly memoryLoading = signal(false);
  readonly memoryError = signal<string | null>(null);
  readonly archiveLoading = signal(false);
  readonly archiveError = signal<string | null>(null);
  private cursor: string | null = null;
  private hasMore = true;
  private loadingMore = false;
  private version = 0;
  private memoryVersion = 0;
  private archiveVersion = 0;
  private readonly imageSources = new WeakMap<ViewerImage, BackendImage>();

  constructor() {
    this.backend.changed
      .pipe(
        filter((change) => change.dataset === 'IMAGES' || change.dataset === 'ALL'),
        debounceTime(150),
        takeUntilDestroyed(),
      )
      .subscribe(() => void this.refreshImages());
    void this.refreshImages();
  }

  async refreshImages() {
    const version = ++this.version;
    this.loading.set(true);
    this.loadingMore = false;
    try {
      const desired = Math.max(25, this.images().length);
      const collected: BackendImage[] = [];
      let page: ImagePage;
      let after: string | null = null;
      do {
        page = await this.page(Math.min(100, desired - collected.length), after);
        if (version !== this.version) return;
        collected.push(...page.items);
        after = page.endCursor;
      } while (collected.length < desired && page.hasNextPage);
      const memoryIndex = await this.backend.query<{ memoryDates: BackendMemoryDate[]; memoryYears: number[] }>(
        'query MemoryIndex { memoryDates { month day photoYearCount photoCount } memoryYears }',
      );
      if (version !== this.version) return;
      const previousMemoryImages = this.selectedMemory()?.days.flatMap((day) => day.images) ?? [];
      const existing = new Map([...previousMemoryImages, ...this.images()].map((image) => [image.id, image]));
      this.images.set(collected.map((image) => this.adapt(image, existing.get(image.id))));
      this.memoryDates.set(memoryIndex.memoryDates);
      this.memoryYears.set(memoryIndex.memoryYears);
      this.cursor = page.endCursor;
      this.hasMore = page.hasNextPage;
      this.imageCount.set(page.totalCount);
      this.error.set(null);
    } catch {
      if (version === this.version) this.error.set('Fotos konnten nicht aktualisiert werden.');
    } finally {
      if (version === this.version) this.loading.set(false);
    }
  }

  async loadMore() {
    if (this.loading() || this.loadingMore || !this.hasMore) return;
    this.loadingMore = true;
    const version = this.version;
    try {
      const page = await this.page(25, this.cursor);
      if (version !== this.version) return;
      this.images.update((images) => images.concat(page.items.map((image) => this.adapt(image))));
      this.cursor = page.endCursor;
      this.hasMore = page.hasNextPage;
      this.imageCount.set(page.totalCount);
    } catch (error) {
      if (version !== this.version) return;
      if (error instanceof Error && error.message.includes('IMAGE_CURSOR_EXPIRED')) {
        void this.refreshImages();
      } else {
        this.error.set('Weitere Fotos konnten nicht geladen werden.');
      }
    } finally {
      if (version === this.version) this.loadingMore = false;
    }
  }

  private async page(first: number, after: string | null) {
    const response = await this.backend.query<{ images: ImagePage }>(
      `query Images($first: Int!, $after: String) { images(first: $first, after: $after) {
        revision totalCount endCursor hasNextPage items { ${IMAGE_FIELDS} }
      } }`,
      { first, after },
    );
    return response.images;
  }

  async loadMemoryDay(date: BackendMemoryDate, dates: BackendMemoryDate[]) {
    const version = ++this.memoryVersion;
    const existingMemoryImages = this.selectedMemory()?.days.flatMap((day) => day.images) ?? [];
    this.selectedMemory.set(null);
    this.memoryLoading.set(true);
    this.memoryError.set(null);
    try {
      const variables: Record<string, number> = {};
      const selections = dates.map((memoryDate, index) => {
        variables[`month${index}`] = memoryDate.month;
        variables[`day${index}`] = memoryDate.day;
        return `memory${index}: memoryImages(month: $month${index}, day: $day${index}) {
          totalCount endCursor hasNextPage items { ${IMAGE_FIELDS} }
        }`;
      });
      const declarations = dates.map((_, index) => `$month${index}: Int!, $day${index}: Int!`).join(', ');
      const result = await this.backend.query<Record<string, ImagePage>>(
        `query MemoryDays(${declarations}) { ${selections.join('\n')} }`,
        variables,
      );
      if (version !== this.memoryVersion) return;
      const existingImages = [...existingMemoryImages, ...this.images()];
      const existing = new Map(existingImages.map((image) => [image.id, image]));
      const days = dates.flatMap((memoryDate, index) => {
        const page = result[`memory${index}`];
        const images = page.items.map((image) => this.adapt(image, existing.get(image.id)));
        return images.length
          ? [
              {
                month: memoryDate.month,
                day: memoryDate.day,
                images,
                count: page.totalCount,
                endCursor: page.endCursor,
                hasNextPage: page.hasNextPage,
              },
            ]
          : [];
      });
      this.selectedMemory.set(
        days.length
          ? {
              month: date.month,
              day: date.day,
              days,
            }
          : null,
      );
    } catch {
      if (version === this.memoryVersion) this.memoryError.set('Erinnerungen konnten nicht geladen werden.');
    } finally {
      if (version === this.memoryVersion) this.memoryLoading.set(false);
    }
  }

  async loadMoreMemoryImages(month: number, day: number, after: string | null) {
    const result = await this.backend.query<{ memoryImages: ImagePage }>(
      `query MemoryImages($month: Int!, $day: Int!, $after: String) {
        memoryImages(month: $month, day: $day, after: $after) {
          totalCount endCursor hasNextPage items { ${IMAGE_FIELDS} }
        }
      }`,
      { month, day, after },
    );
    return { ...result.memoryImages, items: result.memoryImages.items.map((image) => this.adapt(image)) };
  }

  async loadArchiveDates(month: number | null, photoYear: number | null) {
    const version = ++this.archiveVersion;
    this.archiveLoading.set(true);
    this.archiveError.set(null);
    try {
      const result = await this.backend.query<{ memoryDates: BackendMemoryDate[] }>(
        `query MemoryDates($month: Int, $photoYear: Int) {
          memoryDates(month: $month, photoYear: $photoYear) { month day photoYearCount photoCount }
        }`,
        { month, photoYear },
      );
      if (version === this.archiveVersion) this.archiveDates.set(result.memoryDates);
    } catch {
      if (version === this.archiveVersion) this.archiveError.set('Erinnerungen konnten nicht geladen werden.');
    } finally {
      if (version === this.archiveVersion) this.archiveLoading.set(false);
    }
  }

  private adapt(source: BackendImage, existing?: ViewerImage): ViewerImage {
    const previous = existing && this.imageSources.get(existing);
    if (
      existing &&
      previous?.id === source.id &&
      previous.name === source.name &&
      previous.takenAt === source.takenAt &&
      previous.modifiedAt === source.modifiedAt &&
      previous.thumbnailUrl === source.thumbnailUrl &&
      previous.originalUrl === source.originalUrl &&
      previous.width === source.width &&
      previous.height === source.height
    )
      return existing;
    const blob = (url: string, original: boolean) =>
      defer(() => {
        const version = new URL(url, window.location.href).searchParams.get('v') ?? undefined;
        const params = { id: source.id, v: version };
        return original ? this.media.getImageOriginal(params) : this.media.getImageThumbnail(params);
      }).pipe(
        share({ connector: () => new ReplaySubject<Blob | null>(1), resetOnComplete: true, resetOnRefCountZero: true }),
        catchError(() => of(null)),
      );
    const image: ViewerImage = {
      id: source.id,
      name: source.name,
      takenAt: new Date(source.takenAt ?? source.modifiedAt),
      width: source.width,
      height: source.height,
      thumbnail$: blob(source.thumbnailUrl, false),
      original$: blob(source.originalUrl, true),
    };
    this.imageSources.set(image, source);
    return image;
  }
}
