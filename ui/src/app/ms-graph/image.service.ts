import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, filter, of, shareReplay } from 'rxjs';
import { BackendImage, BackendMoment, IMAGE_FIELDS, ImagePage } from '../backend/backend.model';
import { BackendService } from '../backend/backend.service';
import { Moment } from '../feature-home/gallery/gallery.model';
import { DriveImageExt } from './image.model';

@Injectable({ providedIn: 'root' })
export class ImageService {
  private readonly backend = inject(BackendService);
  private readonly http = inject(HttpClient);
  readonly loading = signal(false);
  readonly images = signal<DriveImageExt[]>([]);
  readonly moments = signal<Moment[]>([]);
  readonly imageCount = signal(0);
  readonly error = signal<string | null>(null);
  private cursor: string | null = null;
  private hasMore = true;
  private loadingMore = false;
  private version = 0;

  constructor() {
    this.backend.changed.pipe(
      filter((change) => change.dataset === 'IMAGES' || change.dataset === 'ALL'),
      debounceTime(150), takeUntilDestroyed(),
    ).subscribe(() => void this.refreshImages());
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
      const result = await this.backend.query<{ moments: BackendMoment[] }>(
        `query { moments { date images { ${IMAGE_FIELDS} } } }`,
      );
      if (version !== this.version) return;
      const existing = new Map([
        ...this.moments().flatMap((moment) => moment.images), ...this.images(),
      ].map((image) => [image.image.id, image]));
      this.images.set(collected.map((image) => this.adapt(image, existing.get(image.id))));
      for (const image of this.images()) existing.set(image.image.id, image);
      this.moments.set(result.moments.filter((moment) => moment.images.length > 0).map((moment) => {
        const images = moment.images.map((image) => {
          const adapted = this.adapt(image, existing.get(image.id));
          existing.set(image.id, adapted);
          return adapted;
        });
        return { date: moment.date, day: Number(moment.date.slice(-2)), images, poster: signal(images[0]) };
      }));
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
      } }`, { first, after },
    );
    return response.images;
  }

  private adapt(source: BackendImage, existing?: DriveImageExt): DriveImageExt {
    if (existing?.image.thumbnailUrl === source.thumbnailUrl && existing.image.name === source.name) return existing;
    const taken = new Date(source.takenAt ?? source.modifiedAt);
    const modified = new Date(source.modifiedAt);
    const blob = (url: string) => this.http.get(url, { responseType: 'blob' }).pipe(
      shareReplay({ bufferSize: 1, refCount: true }), catchError(() => of(null)),
    );
    return {
      image: {
        id: source.id, driveId: '', name: source.name,
        takenAt: { date: taken.getTime(), day: taken.getDate(), month: taken.getMonth() },
        lastModifiedAt: { date: modified.getTime(), day: modified.getDate(), month: modified.getMonth() },
        thumbnailUrl: source.thumbnailUrl, originalUrl: source.originalUrl,
      },
      thumbnail$: blob(source.thumbnailUrl), original$: blob(source.originalUrl),
    };
  }
}
