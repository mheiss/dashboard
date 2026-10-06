import { Component, computed, effect, inject, OnDestroy, signal, ChangeDetectionStrategy } from '@angular/core';
import { DialogRef } from '@angular/cdk/dialog';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { AppConfigService } from '../feature-config/config.service';
import { LayoutService } from '../utils/layout.service';
import { Video } from './video/video';
import { Camera, isCamera, PLAY_DELAY, PlayableCamera } from './protect.model';
import { MotionService, MotionSnapshot } from './motion.service';
import { of } from 'rxjs';
import { PopupService } from '../popup/popup.service';
import { DetailViewerComponent } from '../feature-home/gallery/detail-viewer/detail-viewer';
import { DetailViewerData } from '../feature-home/gallery/gallery.model';
import { DriveImageExt } from '../ms-graph/image.model';

@Component({
  selector: 'app-protect',
  templateUrl: './protect.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [Video, DatePipe],
})
export class Protect implements OnDestroy {
  readonly config = inject(AppConfigService);
  readonly layout = inject(LayoutService);
  readonly router = inject(Router);
  readonly activatedRoute = inject(ActivatedRoute);
  readonly motion = inject(MotionService);
  private readonly popup = inject(PopupService);
  private snapshotDialog?: DialogRef<string>;

  private readonly cameraOrder: Camera[] = Object.keys(this.config.config().protect.cameras);
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
    return this.config.config().protect.cameras[camera] ?? camera;
  }

  openSnapshot(snapshot: MotionSnapshot): void {
    const group = this.motion.groups().find((group) => group.snapshots.some((image) => image.id === snapshot.id));
    if (!group) {
      return;
    }
    const images: DriveImageExt[] = group.snapshots.map((image) => {
      const timestamp = { date: image.timestamp.getTime(), day: image.timestamp.getDate(), month: image.timestamp.getMonth() };
      const blob = of(image.image);
      return {
        image: {
          id: image.id,
          driveId: 'motion',
          name: this.cameraLabel(image.camera) + ' - ' + (image.type === 'smart' ? 'Smarte Bewegung' : 'Bewegung'),
          takenAt: timestamp,
          lastModifiedAt: timestamp,
        },
        thumbnail$: blob,
        original$: blob,
      };
    });
    this.snapshotDialog?.close();
    this.snapshotDialog = this.popup.open(DetailViewerComponent, {
      data: {
        image: images.find((image) => image.image.id === snapshot.id)!,
        images: signal(images),
        imageCount: images.length,
        loadMore: () => {},
      } satisfies DetailViewerData,
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
