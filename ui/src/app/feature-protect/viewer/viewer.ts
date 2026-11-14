import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, ElementRef, inject, OnDestroy, OnInit, Signal, viewChild } from '@angular/core';
import { LucideX } from '@lucide/angular';
import { PanzoomObject } from '@panzoom/panzoom';
import { cameraZoom } from '../camera-zoom';

type ViewerData =
  | {
      kind: 'video';
      stream: Signal<MediaStream | null>;
      poster: Signal<string | null>;
      statusText: Signal<string | null>;
    }
  | {
      kind: 'snapshot';
      imageUrl: Signal<string | null>;
      statusText: Signal<string | null>;
    };

@Component({
  selector: 'app-video-viewer',
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './viewer.html',
  host: { class: 'block h-full min-h-0 w-full' },
  imports: [LucideX],
})
export class VideoViewer implements OnInit, OnDestroy {
  readonly dialogRef = inject(DialogRef);
  readonly data: ViewerData = inject<{ data: ViewerData }>(DIALOG_DATA).data;
  private readonly zoomElement = viewChild.required<ElementRef<HTMLElement>>('zoomElement');
  private panzoom?: PanzoomObject;

  private readonly onWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.panzoom?.zoomWithWheel(event);
  };

  ngOnInit(): void {
    const element = this.zoomElement().nativeElement;
    this.panzoom = cameraZoom(element, { pan: true, touchAction: 'none' });
    element.addEventListener('wheel', this.onWheel, { passive: false });
  }

  ngOnDestroy(): void {
    const element = this.zoomElement().nativeElement;
    element.removeEventListener('wheel', this.onWheel);
    this.panzoom?.destroy();
  }
}
