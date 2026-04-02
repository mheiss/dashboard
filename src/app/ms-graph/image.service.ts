import { inject, Injectable, signal } from '@angular/core';
import { DriveItem } from '@microsoft/microsoft-graph-types';
import { firstValueFrom, of, tap } from 'rxjs';
import { AppConfigService } from '../feature-config/config.service';
import { DebugService } from '../utils/debug.service';
import { getDeltaLink, getImageCount, loadImages, loadMoments, removeDeltaLink, removeImage, saveDeltaLink, saveImage } from './database';
import { GraphRestService } from './graph.service';
import { DriveImage, DriveImageExt, toDriveImage } from './image.model';
import { HttpErrorResponse } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class ImageService {
  private readonly graphService = inject(GraphRestService);
  private readonly appConfigService = inject(AppConfigService);
  private readonly debug = inject(DebugService);

  readonly loading = signal(true);
  readonly folders = signal<DriveItem[]>([]);
  readonly images = signal<DriveImageExt[]>([]);
  readonly moments = signal<DriveImageExt[]>([]);
  readonly imageCount = signal(0);

  nextKey: IDBValidKey | null;

  constructor() {
    this.getImageSourceToDisplay().then((folders) => {
      this.folders.set(folders);
      this.refreshImages();
    });
  }

  /**
   * Fetches the latest changes of all configured folders
   */
  async refreshImages() {
    if (this.folders().length === 0) {
      return;
    }
    this.loading.set(true);

    // Fetch all changes in all folders
    // Retry up to three times to handle potential errors
    let foldersToRefresh = this.folders();
    for (let i = 0; i < 3; i++) {
      const failedFolders = await this.doRefreshImages(foldersToRefresh);
      if (failedFolders.length === 0) {
        break;
      }
      foldersToRefresh = failedFolders;
    }
    this.loading.set(false);

    // Provide image counter
    getImageCount().then((count) => {
      this.imageCount.set(count);
    });

    // Refresh moments
    this.refreshMoments();

    // Update images when done
    this.nextKey = null;
    this.images.set([]);
    this.loadMore();
  }

  /**
   *  Refreshes the given folders and returns the ones that failed to refresh.
   */
  private async doRefreshImages(folders: DriveItem[]) {
    // Create a task for each folder
    const tasks: Promise<void>[] = [];
    for (const folder of folders) {
      const task = this.refreshImagesOf(folder);
      tasks.push(task);
    }

    const failed = [];
    const results = await Promise.allSettled(tasks);
    for (const [index, result] of results.entries()) {
      const folder = folders[index];
      if (result.status === 'fulfilled') {
        continue;
      }
      failed.push(folder);
      if (result.reason instanceof HttpErrorResponse) {
        if (result.reason.status === 410) {
          console.error('Removing invalid delta token:', folder.name);
          await removeDeltaLink(folder);
        } else {
          console.error('Error while refreshing images of folder %s: %s', folder.name, result.reason.message);
        }
      }
    }
    return failed;
  }

  /**
   * Fetches images what happened on this day throughout the years
   */
  async refreshMoments() {
    let date = new Date();
    let found = 0;
    let daysBack = 0;

    const moments: DriveImageExt[] = [];
    while (found < 4 && daysBack < 10) {
      const momentsOfDay = await loadMoments(date.getDate(), date.getMonth());
      if (momentsOfDay && momentsOfDay.length > 0) {
        found++;
      }
      for (const image of momentsOfDay) {
        const thumbnail$ = this.getThumbnail(image);
        const original$ = this.graphService.getImageBlob(image);
        moments.push({ image, thumbnail$, original$ });
      }
      // continue with the previous day
      daysBack++;
      date.setDate(date.getDate() - 1);
    }
    this.moments.set(moments);
  }

  /**
   * Returns the latest changes of the given folder
   */
  private async refreshImagesOf(folder: DriveItem): Promise<void> {
    const deltaLink = await getDeltaLink(folder);
    let response$ = deltaLink ? this.graphService.getNextChanges(deltaLink) : this.graphService.getChanges(folder);
    this.debug.log('%s: Start synchronization of images.', folder.name);

    let finished = false;
    let newImages = 0;
    while (!finished) {
      let response = await firstValueFrom(response$);
      for (const item of response.value) {
        if (item.id && item.deleted) {
          await removeImage(item.id);
          continue;
        }
        const image = toDriveImage(item);
        if (image) {
          newImages++;
          await saveImage(image);
        }
      }

      // Continue loading as long as we have a next link
      const nextLink = response['@odata.nextLink'];
      if (nextLink) {
        this.debug.log('%s: Requesting next changes...', folder.name);
        response$ = this.graphService.getNextChanges(nextLink);
        continue;
      }

      // Stop loading and remember the delta link
      finished = true;
      const deltaLink = response['@odata.deltaLink'];
      if (deltaLink) {
        this.debug.log('%s: Synchronization finished. # New images: %s', folder.name, newImages);
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
          day: now.getDate(),
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
