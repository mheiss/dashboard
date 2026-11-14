import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, ElementRef, inject, OnDestroy, OnInit, viewChild } from '@angular/core';
import { LucideX } from '@lucide/angular';
import { PanzoomObject } from '@panzoom/panzoom';
import { cameraZoom } from '../camera-zoom';

@Component({
  selector: 'app-video-viewer',
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './viewer.html',
  host: { class: 'block h-full min-h-0 w-full' },
  imports: [LucideX],
})
export class VideoViewer implements OnInit, OnDestroy {
  readonly dialogRef = inject(DialogRef);
  readonly stream: MediaStream = inject<{ data: { stream: MediaStream } }>(DIALOG_DATA).data.stream;
  private readonly videoElement = viewChild.required<ElementRef<HTMLVideoElement>>('videoElement');
  private panzoom?: PanzoomObject;

  private readonly onWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.panzoom?.zoomWithWheel(event);
  };

  ngOnInit(): void {
    const element = this.videoElement().nativeElement;
    this.panzoom = cameraZoom(element);
    element.addEventListener('wheel', this.onWheel, { passive: false });
  }

  ngOnDestroy(): void {
    const element = this.videoElement().nativeElement;
    element.removeEventListener('wheel', this.onWheel);
    this.panzoom?.destroy();
  }
}
