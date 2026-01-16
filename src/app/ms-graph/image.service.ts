import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, of, tap } from 'rxjs';
import { getDeltaLink, getImageCount, loadImages, removeImage, saveDeltaLink, saveImage } from './database';
import { DriveImage, DriveImageExt, getImageBlob, getImages, getNextImages, getThumbnailBlob, ofDriveItem } from './image.model';

@Injectable({ providedIn: 'root' })
export class ImageService {
  private readonly httpClient = inject(HttpClient);

  readonly loading = signal(false);
  readonly images = signal<DriveImageExt[]>([]);
  readonly imageCount = signal(0);

  nextKey: IDBValidKey | null;

  /**
   * Synchronizes the local cache with the remote service.
   */
  async refreshImages() {
    const deltaLink = await getDeltaLink();
    let response$ = deltaLink ? getNextImages(this.httpClient, deltaLink) : getImages(this.httpClient);
    console.log('Requesting changes from OneDrive...');

    this.loading.set(true);
    while (this.loading()) {
      let response = await firstValueFrom(response$);
      if (response.value.length === 0) {
        console.log('Images are in sync. Nothing do do.');
      } else {
        console.log('Processing %s changes.', response.value);
      }

      for (const item of response.value) {
        if (item.id && item.deleted) {
          await removeImage(item.id);
          continue;
        }
        const image = ofDriveItem(item);
        if (image) {
          await saveImage(image);
        }
      }

      // Continue loading as long as we have a next link
      const nextLink = response['@odata.nextLink'];
      if (nextLink) {
        console.log('Requesting next changes...');
        response$ = getNextImages(this.httpClient, nextLink);
        continue;
      }

      // Stop loading and remember the delta link
      this.loading.set(false);
      const deltaLink = response['@odata.deltaLink'];
      if (deltaLink) {
        console.log('Storing delta link for next time.');
        saveDeltaLink(deltaLink);
      }
    }

    // Provide image counter
    getImageCount().then((count) => {
      this.imageCount.set(count);
    });

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

      const imageExts: DriveImageExt[] = [];
      for (const image of response.items) {
        const thumbnail$ = this.getThumbnail(image);
        const original$ = getImageBlob(this.httpClient, image);
        imageExts.push({ image, thumbnail$, original$ });
      }
      this.images.update((images) => {
        return images.concat(imageExts);
      });
      this.loading.set(false);
    });
  }

  getThumbnail(image: DriveImage) {
    if (image.thumbnailBlob) {
      return of(image.thumbnailBlob);
    }
    return getThumbnailBlob(this.httpClient, image).pipe(
      tap((blob) => {
        image.thumbnailBlob = blob;
        image.lastModifiedAt = new Date().getTime();
        saveImage(image);
      }),
    );
  }
}
