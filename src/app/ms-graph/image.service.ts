import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, of, tap } from 'rxjs';
import { getDeltaLink, getImageCount, loadImages, removeImage, saveDeltaLink, saveImage } from './database';
import { GraphRestService } from './graph.service';
import { DriveImage, DriveImageExt, toDriveImage } from './image.model';

@Injectable({ providedIn: 'root' })
export class ImageService {
  private readonly graphService = inject(GraphRestService);

  readonly loading = signal(false);
  readonly images = signal<DriveImageExt[]>([]);
  readonly imageCount = signal(0);

  nextKey: IDBValidKey | null;

  /**
   * Synchronizes the local cache with the remote service.
   */
  async refreshImages() {
    const deltaLink = await getDeltaLink();
    let response$ = deltaLink ? this.graphService.getNextImages(deltaLink) : this.graphService.getImages();
    console.log('Requesting changes from OneDrive...');

    this.loading.set(true);
    while (this.loading()) {
      let response = await firstValueFrom(response$);
      if (response.value.length === 0) {
        console.log('Images are in sync. Nothing do do.');
      } else {
        console.log('Processing next block with %s items.).', response.value.length);
      }

      for (const item of response.value) {
        if (item.id && item.deleted) {
          await removeImage(item.id);
          continue;
        }
        const image = toDriveImage(item);
        if (image) {
          await saveImage(image);
        }
      }

      // Continue loading as long as we have a next link
      const nextLink = response['@odata.nextLink'];
      if (nextLink) {
        console.log('Requesting next changes...');
        response$ = this.graphService.getNextImages(nextLink);
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
        const original$ = this.graphService.getImageBlob(image);
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
    return this.graphService.getThumbnailBlob(image).pipe(
      tap((blob) => {
        const now = new Date();
        image.thumbnailBlob = blob;
        image.lastModifiedAt = {
          date: now.getTime(),
          day: now.getDay(),
          month: now.getMonth(),
        };
        saveImage(image);
      }),
    );
  }
}
