import { Component, inject, input, OnChanges, signal } from '@angular/core';
import { distinctUntilChanged, Subject, takeUntil } from 'rxjs';
import { Camera, StreamQuality } from '../models/dashboard.model';
import { Status } from '../webrtc/webrtc';
import { WebRTCService } from '../webrtc/webrtc.service';

@Component({
  selector: 'app-video',
  templateUrl: './video.html',
})
export class Video implements OnChanges {
  private readonly webRtc = inject(WebRTCService);
  private streamChanged = new Subject<void>();

  readonly camera = input.required<Camera>();
  readonly quality = input<StreamQuality>('medium');
  readonly showStats = signal<boolean>(false);

  readonly video = signal<MediaStream | null>(null);
  readonly poster = signal<string | null>(null);
  readonly stats = signal<string | null>(null);
  readonly classes = signal<string | null>(null);

  ngOnChanges(): void {
    this.streamChanged.next();

    const offer = this.webRtc.start(this.camera(), this.quality());
    offer.media.pipe(takeUntil(this.streamChanged)).subscribe((media) => {
      this.video.set(media);
    });
    offer.poster.pipe(takeUntil(this.streamChanged)).subscribe((poster) => {
      this.poster.set(poster);
    });
    offer.status.pipe(takeUntil(this.streamChanged), distinctUntilChanged()).subscribe((status) => {
      this.classes.set(this.toCssClass(status));
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
      case 'streaming':
        return classes + ' bg-[#39FF14]';
      case 'stale':
        return classes + ' bg-gray-500';
    }
  }
}
