import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, map, of, tap } from 'rxjs';
import { getDeltaLink, loadImages, removeImage, saveDeltaLink, saveImage } from './database';
import { DriveImage, getImages, getNextImages, getThumbnail, ImageWithThumbnail } from './image.model';

@Injectable({ providedIn: 'root' })
export class ImageService {
  private readonly httpClient = inject(HttpClient);

  readonly loading = signal(false);
  readonly images = signal<ImageWithThumbnail[]>([]);
  nextKey: IDBValidKey | null;

  /**
   * Synchronizes the local cache with the remote service.
   */
  async refreshImages() {
    const deltaLink = await getDeltaLink();
    let response$ = deltaLink ? getNextImages(this.httpClient, deltaLink) : getImages(this.httpClient);

    let loading = true;
    while (loading) {
      let response = await firstValueFrom(response$);
      for (const item of response.value) {
        if (item.id && item.name && item.photo && item.photo.takenDateTime) {
          const takenAt = new Date(item.photo.takenDateTime).getTime();
          const modified = item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime) : new Date();
          await saveImage({ id: item.id, name: item.name, takenAt: takenAt, lastModifiedAt: modified.getTime() });
        }
        if (item.id && item.deleted) {
          await removeImage(item.id);
          continue;
        }
      }

      // Continue loading as long as we have a next link
      const nextLink = response['@odata.nextLink'];
      if (nextLink) {
        response$ = getNextImages(this.httpClient, nextLink);
        continue;
      }

      // Stop loading and remember the delta link
      loading = false;
      const deltaLink = response['@odata.deltaLink'];
      if (deltaLink) {
        saveDeltaLink(deltaLink);
      }
    }

    // Update images when done
    this.nextKey = null;
    this.images.set([]);
    this.loadMore();
  }

  /**
   * Loads and displays the most recent images.
   */
  loadMore() {
    if (this.loading()) {
      return;
    }
    this.loading.set(true);

    const nextImages = loadImages(25, this.nextKey);
    nextImages.then((response) => {
      this.nextKey = response.lastKey;

      const withThumbnails: ImageWithThumbnail[] = [];
      for (const image of response.items) {
        const thumbnail$ = this.getThumbnail(image);
        withThumbnails.push({ image: image, thumbnail$: thumbnail$ });
      }
      this.images.update((images) => {
        return images.concat(withThumbnails);
      });
      this.loading.set(false);
    });
  }

  getThumbnail(image: DriveImage) {
    if (image.thumbnailBlob) {
      return of(URL.createObjectURL(image.thumbnailBlob));
    }
    return getThumbnail(this.httpClient, image).pipe(
      tap((blob) => {
        image.thumbnailBlob = blob;
        image.lastModifiedAt = new Date().getTime();
        saveImage(image);
      }),
      map((blob) => URL.createObjectURL(blob)),
    );
  }
}
