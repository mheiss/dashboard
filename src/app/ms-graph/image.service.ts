import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, of, tap } from 'rxjs';
import { getDeltaLink, getImageCount, loadImages, removeImage, saveDeltaLink, saveImage } from './database';
import { GraphRestService } from './graph.service';
import { DriveImage, DriveImageExt, toDriveImage } from './image.model';
import { AppConfigService } from '../feature-config/config.service';
import { DriveItem } from '@microsoft/microsoft-graph-types';

@Injectable({ providedIn: 'root' })
export class ImageService {
  private readonly graphService = inject(GraphRestService);
  private readonly appConfigService = inject(AppConfigService);

  readonly loading = signal(false);
  readonly folders = signal<DriveItem[]>([]);
  readonly images = signal<DriveImageExt[]>([]);
  readonly imageCount = signal(0);

  nextKey: IDBValidKey | null;

  constructor() {
    this.getImageSourceToDisplay().then((folders) => {
      this.folders.set(folders);
      this.refreshImages();
    });
  }

  /**
   * Obtains the latest changes of all configured folders
   */
  refreshImages() {
    // Fetch all changes in all folders
    this.loading.set(true);
    const tasks: Promise<void>[] = [];
    for (const folder of this.folders()) {
      const task = this.refreshImagesOf(folder);
      tasks.concat(task);
    }

    Promise.all(tasks).then(() => {
      this.loading.set(false);

      // Provide image counter
      getImageCount().then((count) => {
        this.imageCount.set(count);
      });

      // Update images when done
      this.nextKey = null;
      this.images.set([]);
      this.loadMore();
    });
  }

  /**
   * Obtains the latest changes of the given folder
   */
  private async refreshImagesOf(folder: DriveItem) {
    const deltaLink = await getDeltaLink(folder);
    let response$ = deltaLink ? this.graphService.getNextChanges(deltaLink) : this.graphService.getChanges(folder);
    console.log('Synchronizing folder %s...', folder.name);

    let finished = false;
    while (!finished) {
      let response = await firstValueFrom(response$);
      if (response.value.length === 0) {
        console.log('  Images are in sync. Nothing do do.');
      } else {
        console.log('  Processing next block with %s items.', response.value.length);
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
        console.log('  Requesting next changes...');
        response$ = this.graphService.getNextChanges(nextLink);
        continue;
      }

      // Stop loading and remember the delta link
      finished = true;
      const deltaLink = response['@odata.deltaLink'];
      if (deltaLink) {
        console.log('  Storing delta link for next time.');
        saveDeltaLink(folder, deltaLink);
      }
    }
  }

  /**
   * Loads and displays the most recent images.
   */
  loadMore() {
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

  async getImageSourceToDisplay() {
    const items: DriveItem[] = [];
    for (const folder of this.appConfigService.config().folders) {
      const item = await firstValueFrom(this.graphService.getItem(folder));
      items.push(item);
    }
    return items;
  }
}
