import { Component, computed, effect, inject, OnDestroy, signal, ChangeDetectionStrategy, TemplateRef, viewChild } from '@angular/core';
import { Dialog, DialogModule, DialogRef } from '@angular/cdk/dialog';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { AppConfigService } from '../feature-config/config.service';
import { LayoutService } from '../utils/layout.service';
import { Video } from './video/video';
import { Camera, isCamera, PLAY_DELAY, PlayableCamera } from './protect.model';
import { MotionService, MotionSnapshot } from './motion.service';

@Component({
  selector: 'app-protect',
  templateUrl: './protect.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [Video, DatePipe, DialogModule],
})
export class Protect implements OnDestroy {
  readonly config = inject(AppConfigService);
  readonly layout = inject(LayoutService);
  readonly router = inject(Router);
  readonly activatedRoute = inject(ActivatedRoute);
  readonly motion = inject(MotionService);
  private readonly dialog = inject(Dialog);
  private readonly snapshotViewer = viewChild.required<TemplateRef<unknown>>('snapshotViewer');
  private snapshotDialog?: DialogRef<void>;

  private readonly cameraOrder: Camera[] = this.config.config().protect.cameras;
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
    return this.config.config().protect.cameraLabels?.[camera] ?? camera;
  }

  openSnapshot(snapshot: MotionSnapshot): void {
    this.snapshotDialog?.close();
    this.snapshotDialog = this.dialog.open<void, MotionSnapshot>(this.snapshotViewer(), {
      data: snapshot,
      width: '100vw',
      height: '100dvh',
      maxWidth: '100vw',
      maxHeight: '100dvh',
      ariaLabel: 'Bewegung bei Kamera ' + this.cameraLabel(snapshot.camera),
      ariaModal: true,
    });
  }

  next() {
    if (this.cameraOrder.length === 0) {
      return;
    }
    const idx = this.cameraOrder.indexOf(this.pinned());
    let next = idx + 1;
    if (next >= this.cameraOrder.length) {
      next = 0;
    }
    this.pinned.set(this.cameraOrder[next]);
  }

  previous() {
    if (this.cameraOrder.length === 0) {
      return;
    }
    const idx = this.cameraOrder.indexOf(this.pinned());
    let previous = idx - 1;
    if (previous < 0) {
      previous = this.cameraOrder.length - 1;
    }
    this.pinned.set(this.cameraOrder[previous]);
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
