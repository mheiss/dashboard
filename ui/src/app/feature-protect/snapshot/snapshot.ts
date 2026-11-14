import { ChangeDetectionStrategy, Component, ElementRef, inject, input, OnDestroy, OnInit, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { PanzoomObject } from '@panzoom/panzoom';
import { catchError, combineLatest, exhaustMap, from, of, switchMap, timer } from 'rxjs';
import { CameraService } from '../../backend/generated/services/camera.service';
import { DebugService } from '../../utils/debug.service';
import { VisibilityService } from '../../utils/visibility.service';
import { cameraZoom } from '../camera-zoom';
import { Camera } from '../protect.model';

@Component({
  selector: 'app-snapshot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './snapshot.html',
})
export class Snapshot implements OnInit, OnDestroy {
  readonly camera = input.required<Camera>();
  readonly play = input(true);
  readonly zoom = input(true);
  readonly fit = input(false);
  readonly imageUrl = signal<string | null>(null);
  readonly statusText = signal<string | null>(null);
  private readonly image = viewChild.required<ElementRef<HTMLImageElement>>('image');
  private readonly api = inject(CameraService);
  private readonly visibility = inject(VisibilityService);
  private readonly debug = inject(DebugService);
  private panzoom?: PanzoomObject;

  private readonly onWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.panzoom?.zoomWithWheel(event);
  };

  constructor() {
    combineLatest([toObservable(this.camera), toObservable(this.play), this.visibility.screenOn$])
      .pipe(
        switchMap(([camera, play, screenOn]) => {
          this.setImage(null);
          this.panzoom?.reset();
          this.statusText.set(play && screenOn ? 'Starting' : null);
          if (!play || !screenOn) return of(null);
          return timer(0, 1000).pipe(
            exhaustMap(() =>
              from(this.api.getCameraFrame({ src: 'unifi_' + camera })).pipe(
                catchError((error) => {
                  this.debug.log('%s: Snapshot request failed. %s', camera, error);
                  this.setImage(null);
                  this.statusText.set('No signal');
                  return of(null);
                }),
              ),
            ),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((blob) => {
        if (blob) {
          this.setImage(URL.createObjectURL(blob));
          this.statusText.set(null);
        }
      });
  }

  ngOnInit(): void {
    if (this.zoom()) {
      const element = this.image().nativeElement;
      this.panzoom = cameraZoom(element);
      element.addEventListener('wheel', this.onWheel, { passive: false });
    }
  }

  ngOnDestroy(): void {
    this.image().nativeElement.removeEventListener('wheel', this.onWheel);
    this.panzoom?.destroy();
    this.setImage(null);
  }

  private setImage(url: string | null): void {
    const previous = this.imageUrl();
    this.imageUrl.set(url);
    if (previous) URL.revokeObjectURL(previous);
  }
}
