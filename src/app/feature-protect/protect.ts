import { Component, effect, inject, OnDestroy, signal, ChangeDetectionStrategy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { AppConfigService } from '../feature-config/config.service';
import { LayoutService } from '../utils/layout.service';
import { Video } from './video/video';
import { Camera, isCamera, PLAY_DELAY, PlayableCamera } from './protect.model';

@Component({
  selector: 'app-protect',
  templateUrl: './protect.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [Video],
})
export class Protect implements OnDestroy {
  readonly config = inject(AppConfigService);
  readonly layout = inject(LayoutService);
  readonly router = inject(Router);
  readonly activatedRoute = inject(ActivatedRoute);

  private readonly cameraOrder: Camera[] = this.config.config().protect.cameras;
  readonly cameras = signal<PlayableCamera[]>(this.cameraOrder.map((camera) => ({ camera, play: false })));
  readonly pinned = signal<Camera>(this.cameraOrder[0] ?? '');
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
