import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { getImages, getNextImages, getThumbnail, ItemWithThumbnail } from './image.model';
import { DriveItem } from '@microsoft/microsoft-graph-types';

@Injectable({ providedIn: 'root' })
export class ImageService {
  private readonly httpClient = inject(HttpClient);

  readonly images = signal<ItemWithThumbnail[]>([]);
  readonly nextLink = signal<string | null>(null);
  readonly loading = signal(false);

  private readonly pageSize = 25;

  /**
   * Loads and displays the most recent images.
   */
  refreshImages() {
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
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    // Fetch until we have enough images
    let newItems: DriveItem[] = [];
    while (newItems.length < this.pageSize && (this.nextLink() || this.images().length === 0)) {
      const response = await firstValueFrom(this.doLoadImages());

      const images = response.value.filter((item) => item.file?.mimeType?.startsWith('image/'));
      const filteredByDate = images.filter((image) => {
        if (image.photo?.takenDateTime) {
          const takenAt = new Date(image.photo?.takenDateTime).getTime();
          return takenAt >= twoWeeksAgo.getTime();
        }
        return false;
      });
      newItems = newItems.concat(filteredByDate);
      console.log('Loaded %s images. Matching:', images.length, filteredByDate.length);
      this.nextLink.set(response['@odata.nextLink'] ?? null);
    }
    console.log('Finished fetching images.');
    console.log('Images: ', newItems.length);
    console.log('HasMore: ', this.nextLink());

    // Fetch thumbnails for the new elements
    const withThumbnails: ItemWithThumbnail[] = [];
    for (const item of newItems) {
      const thumbnail = await firstValueFrom(getThumbnail(this.httpClient, item));
      withThumbnails.push({ item: item, thumb: thumbnail });
    }
    this.images.update((old) => {
      const merged = [...old, ...withThumbnails];
      const unique = Array.from(new Map(merged.map((i) => [i.item.id, i])).values());
      unique.sort((a, b) => {
        if (a.item.photo?.takenDateTime && b.item.photo?.takenDateTime) {
          const aTaken = new Date(a.item.photo.takenDateTime);
          const bTaken = new Date(b.item.photo.takenDateTime);
          return bTaken.getTime() - aTaken.getTime();
        }
        return 0;
      });
      return unique;
    });
    console.log('Creating thumbnails done.');
    this.loading.set(false);
  }

  doLoadImages() {
    const nextLink = this.nextLink();
    if (nextLink) {
      return getNextImages(this.httpClient, nextLink);
    }
    return getImages(this.httpClient, this.pageSize + 1);
  }
}
