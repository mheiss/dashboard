import { Component, DestroyRef, ElementRef, inject, input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Status } from '../webrtc/webrtc';
import { WebRTCService } from '../webrtc/webrtc.service';

@Component({
  selector: 'app-video',
  templateUrl: './video.html',
})
export class Video implements OnInit, OnDestroy {
  private readonly webRtc = inject(WebRTCService);
  private readonly destroyer = inject(DestroyRef);

  readonly src = input.required<string>();

  @ViewChild('video', { static: true })
  private videoRef: ElementRef<HTMLVideoElement>;

  @ViewChild('status', { static: true })
  private statusRef: ElementRef<HTMLDivElement>;

  ngOnInit(): void {
    const offer = this.webRtc.start(this.src());
    offer.media.pipe(takeUntilDestroyed(this.destroyer)).subscribe((media) => {
      const videoEl = this.videoRef.nativeElement;
      videoEl.srcObject = media;
      videoEl.muted = true;
      videoEl.play();
    });
    offer.poster.pipe(takeUntilDestroyed(this.destroyer)).subscribe((poster) => {
      if (poster) {
        const videoEl = this.videoRef.nativeElement;
        videoEl.poster = poster;
      }
    });
    offer.health.pipe(takeUntilDestroyed(this.destroyer)).subscribe((status) => {
      const statusEl = this.statusRef.nativeElement;
      statusEl.classList = this.toCssClass(status);
    });
  }

  ngOnDestroy(): void {
    this.webRtc.stop(this.src());
  }

  private toCssClass(health: Status) {
    switch (health) {
      case 'connecting':
        return 'bg-yellow-500';
      case 'offline':
        return 'bg-red-500';
      case 'streaming':
        return 'bg-green-500';
      case 'stale':
        return 'bg-gray-500';
    }
  }
}
