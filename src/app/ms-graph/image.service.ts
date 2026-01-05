import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { defer, firstValueFrom, map, of, tap } from 'rxjs';
import { getDeltaLink, loadImages, saveDeltaLink, saveImage } from './database';
import { DriveImage, getImages, getNextImages, getThumbnail, ImageWithThumbnail } from './image.model';

@Injectable({ providedIn: 'root' })
export class ImageService {
  private readonly httpClient = inject(HttpClient);

  readonly loading = signal(false);
  readonly images = signal<ImageWithThumbnail[]>([]);
  nextKey: IDBValidKey | null;

  /**
   * Initializes the service and loads the missing images.
   */
  async refreshImages() {
    const deltaLink = await getDeltaLink();
    let response$ = deltaLink ? getNextImages(this.httpClient, deltaLink) : getImages(this.httpClient);

    let loading = true;
    while (loading) {
      let response = await firstValueFrom(response$);
      for (const item of response.value) {
        if (!item.id || !item.file || !item.photo || !item.photo.takenDateTime) {
          continue;
        }

        const takenAt = new Date(item.photo.takenDateTime).getTime();
        const image: DriveImage = { id: item.id, takenAt: takenAt, item: item };
        await saveImage(image);
      }

      // Continue loading as long as we have a next link
      const nextLink = response['@odata.nextLink'];
      if (nextLink) {
        response$ = getNextImages(this.httpClient, nextLink);
        continue;
      }

      // Stop loading and remember the delta link
      loading = false;
      const deltaLink = response['@deltaLink'];
      if (deltaLink) {
        saveDeltaLink(deltaLink);
      }
    }
  }

  /**
   * Loads and displays the most recent images.
   */
  loadMore() {
    if (this.loading()) {
      return;
    }
    this.loading.set(true);

    const top100 = loadImages(this.nextKey);
    top100.then((response) => {
      this.nextKey = response.lastKey;

      const withThumbnails: ImageWithThumbnail[] = [];
      for (const image of response.items) {
        const withThumbnail = image as ImageWithThumbnail;
        if (image.thumbnailUrl) {
          withThumbnail.thumbnail$ = of(image.thumbnailUrl);
        } else {
          withThumbnail.thumbnail$ = defer(() =>
            getThumbnail(this.httpClient, image).pipe(
              tap((t) => {
                if (t?.url) {
                  image.thumbnailUrl = t?.url!;
                  saveImage(image);
                }
              }),
              map((t) => t?.url!),
            ),
          );
        }
        withThumbnails.push(withThumbnail);
      }

      this.images.set(withThumbnails);
      this.loading.set(false);
    });
  }
}
