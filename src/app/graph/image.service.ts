import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { getImages, getNextImages, ItemWithThumbnail } from './image.model';

@Injectable({ providedIn: 'root' })
export class ImageService {
  private readonly httpClient = inject(HttpClient);
  private readonly pageSize = 100;

  readonly images = signal<ItemWithThumbnail[]>([]);
  readonly loading = signal(false);
  readonly nextLink = signal<string | null>(null);

  /**
   * Loads and displays the most recent images.
   */
  refreshImages() {
    this.images.set([]);
    this.nextLink.set(null);
    this.loadMore();
  }

  /**
   * Loads the next bunch of images.
   */
  async loadMore() {
    if (this.loading()) {
      return;
    }
    this.loading.set(true);
    const response = await firstValueFrom(this.doLoadImages());

    // Filter out anything that is not an image and get the thumbnail
    const images = response.value.filter((item) => item.file?.mimeType?.startsWith('image/'));
    const withThumbnails = images.map((item) => {
      let thumbnail = undefined;
      if (item.thumbnails && item.thumbnails[0].medium) {
        thumbnail = item.thumbnails[0].medium;
      }
      return { item: item, thumb: thumbnail } as ItemWithThumbnail;
    });

    // Store the link for the next run
    if (withThumbnails) {
      this.images.update((old) => [...old, ...withThumbnails]);
    }
    this.nextLink.set(response['@odata.nextLink'] ?? null);
    this.loading.set(false);
  }

  doLoadImages() {
    const nextLink = this.nextLink();
    if (nextLink) {
      return getNextImages(this.httpClient, nextLink);
    }
    return getImages(this.httpClient, this.pageSize);
  }
}
