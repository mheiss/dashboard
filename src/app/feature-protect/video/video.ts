import { Component, ElementRef, inject, input, OnChanges, OnInit, signal, viewChild } from '@angular/core';
import { distinctUntilChanged, Subject, takeUntil } from 'rxjs';
import { Camera, StreamQuality } from '../protect.model';
import { WebRTCService } from '../webrtc/webrtc.service';
import Panzoom, { PanzoomObject } from '@panzoom/panzoom';
import { Status } from '../webrtc/webrtc.model';

@Component({
  selector: 'app-video',
  templateUrl: './video.html',
})
export class Video implements OnInit, OnChanges {
  private readonly webRtc = inject(WebRTCService);
  readonly camera = input.required<Camera>();
  readonly play = input<boolean>(true);
  readonly zoom = input<boolean>(true);
  readonly quality = input<StreamQuality>('high');
  readonly showStats = signal<boolean>(false);

  readonly video = signal<MediaStream | null>(null);
  readonly poster = signal<string | null>(null);
  readonly stats = signal<string | null>(null);
  readonly classes = signal<string | null>(null);
  readonly statusText = signal<string | null>(null);

  readonly imageElement = viewChild.required<ElementRef<HTMLImageElement>>('videoElement');
  private streamChanged = new Subject<void>();
  panzoom: PanzoomObject;

  ngOnInit(): void {
    if (this.zoom()) {
      this.panzoom = Panzoom(this.imageElement().nativeElement, {
        maxScale: 5,
        minScale: 1,
      });
    }
  }

  ngOnChanges(): void {
    this.streamChanged.next();
    this.panzoom?.reset();
    if (!this.play()) {
      this.webRtc.stop(this.camera(), this.quality());
      this.video.set(null);
      this.classes.set(null);
      this.statusText.set(null);
      return;
    }
    const offer = this.webRtc.start(this.camera(), this.quality());
    offer.media.pipe(takeUntil(this.streamChanged)).subscribe((media) => {
      this.video.set(media);
    });
    offer.poster.pipe(takeUntil(this.streamChanged)).subscribe((poster) => {
      this.poster.set(poster);
    });
    offer.status.pipe(takeUntil(this.streamChanged), distinctUntilChanged()).subscribe((status) => {
      this.classes.set(this.toCssClass(status));
      this.statusText.set(this.toStatusText(status));
    });
    offer.report.pipe(takeUntil(this.streamChanged), distinctUntilChanged()).subscribe((stats) => {
      const time = new Date(stats.timestamp);
      this.stats.set(`Time: ${time.toLocaleString()} Frames: ${stats.frames} Bytes: ${stats.bytes}`);
    });
  }

  ngOnDestroy(): void {
    this.streamChanged.next();
    this.streamChanged.complete();
    this.webRtc.stop(this.camera(), this.quality());
  }

  private toCssClass(health: Status) {
    const classes = 'h-1 w-1 rounded-full';
    switch (health) {
      case 'offline':
        return classes + ' bg-red-500';
      case 'connecting':
        return classes + ' bg-yellow-500';
      case 'connected':
        return classes + ' bg-blue-500';
      case 'startup':
        return classes + ' bg-sky-400';
      case 'buffering':
        return classes + ' bg-amber-500';
      case 'streaming':
        return classes + ' bg-green-400';
      case 'dead':
        return classes + ' bg-red-500';
    }
  }

  private toStatusText(health: Status): string | null {
    switch (health) {
      case 'offline':
        return 'Offline';
      case 'connecting':
        return 'Connecting';
      case 'connected':
        return 'Connected';
      case 'startup':
        return 'Starting';
      case 'buffering':
        return 'Buffering';
      case 'streaming':
        return null;
      case 'dead':
        return 'No signal';
    }
  }
}
