import { Component, computed, effect, inject, OnDestroy, signal, ChangeDetectionStrategy } from '@angular/core';
import { DialogRef } from '@angular/cdk/dialog';
import { AsyncPipe, DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { AppConfigService } from '../feature-config/config.service';
import { LayoutService } from '../utils/layout.service';
import { Video } from './video/video';
import { Camera, isCamera, PLAY_DELAY, PlayableCamera } from './protect.model';
import { MotionService, MotionSnapshot } from './motion.service';
import { catchError, defer, Observable, of, shareReplay } from 'rxjs';
import { MediaService } from '../backend/generated/services/media.service';
import { PopupService } from '../popup/popup.service';
import { ImageViewerComponent } from '../image-viewer/image-viewer';
import { BlobSrcDirective } from '../image-viewer/blob.directive';
import { ImageViewerData, ViewerImage } from '../image-viewer/image-viewer.model';

@Component({
  selector: 'app-protect',
  templateUrl: './protect.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [Video, DatePipe, AsyncPipe, BlobSrcDirective],
})
export class Protect implements OnDestroy {
  readonly config = inject(AppConfigService);
  readonly layout = inject(LayoutService);
  readonly router = inject(Router);
  readonly activatedRoute = inject(ActivatedRoute);
  readonly motion = inject(MotionService);
  private readonly popup = inject(PopupService);
  private readonly media = inject(MediaService);
  private readonly snapshotBlobs = new Map<string, Observable<Blob | null>>();
  private snapshotDialog?: DialogRef<string>;

  private readonly cameraOrder: Camera[] = Object.keys(this.config.config().cameras);
  readonly cameras = signal<PlayableCamera[]>(this.cameraOrder.map((camera) => ({ camera, play: false })));
  readonly pinned = signal<Camera>(this.cameraOrder[0] ?? '');
  readonly mobileCameras = computed(() => {
    const cameras = this.cameras();
    const pinned = this.pinned();
    return [...cameras.filter((camera) => camera.camera === pinned), ...cameras.filter((camera) => camera.camera !== pinned)];
  });
  private playTimers: number[] = [];

  constructor() {
    effect(() => {
      const retained = new Set(this.motion.groups().flatMap((group) => group.snapshots.map((snapshot) => snapshot.id)));
      for (const id of this.snapshotBlobs.keys()) {
        if (!retained.has(id)) this.snapshotBlobs.delete(id);
      }
    });

    effect(() => {
      this.router.navigate([], {
        queryParams: {
          camera: this.pinned(),
        },
      });
    });

    this.activatedRoute.queryParamMap.pipe(takeUntilDestroyed()).subscribe((map) => {
      const param = map.get('camera');
      if (isCamera(param, this.cameraOrder)) {
        this.pinned.set(param);
      }
    });

    this.scheduleCameraPlayback();
  }

  ngOnDestroy(): void {
    this.clearPlayTimers();
    this.snapshotDialog?.close();
  }

  cameraLabel(camera: Camera): string {
    return this.config.config().cameras[camera] ?? camera;
  }

  snapshotBlob(snapshot: MotionSnapshot): Observable<Blob | null> {
    let blob = this.snapshotBlobs.get(snapshot.id);
    if (!blob) {
      blob = defer(() => this.media.getMotionSnapshot({ id: snapshot.id })).pipe(
        shareReplay({ bufferSize: 1, refCount: true }),
        catchError(() => of(null)),
      );
      this.snapshotBlobs.set(snapshot.id, blob);
    }
    return blob;
  }

  openSnapshot(snapshot: MotionSnapshot): void {
    const group = this.motion.groups().find((group) => group.snapshots.some((image) => image.id === snapshot.id));
    if (!group) {
      return;
    }
    const images: ViewerImage[] = group.snapshots.map((image) => {
      const blob = this.snapshotBlob(image);
      return {
        id: image.id,
        name: this.cameraLabel(image.camera) + ' - ' + (image.type === 'smart' ? 'Smarte Bewegung' : 'Bewegung'),
        takenAt: image.timestamp,
        thumbnail$: blob,
        original$: blob,
      };
    });
    this.snapshotDialog?.close();
    this.snapshotDialog = this.popup.open(ImageViewerComponent, {
      data: {
        image: images.find((image) => image.id === snapshot.id)!,
        images: signal(images),
        imageCount: images.length,
        loadMore: () => {},
      } satisfies ImageViewerData,
      fullScreen: true,
      disableClose: false,
    });
  }

  private scheduleCameraPlayback() {
    this.cameraOrder.forEach((camera, index) => {
      const timer = window.setTimeout(() => {
        this.cameras.update((cameras) => cameras.map((current) => (current.camera === camera ? { ...current, play: true } : current)));
      }, index * PLAY_DELAY);
      this.playTimers.push(timer);
    });
  }

  private clearPlayTimers() {
    this.playTimers.forEach((timer) => clearTimeout(timer));
    this.playTimers = [];
  }
}
