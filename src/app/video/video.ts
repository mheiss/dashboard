import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  OnChanges,
  OnDestroy,
  OnInit,
  output,
  signal,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Status } from '../webrtc/webrtc';
import { WebRTCService } from '../webrtc/webrtc.service';
import { distinctUntilChanged, Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-video',
  templateUrl: './video.html',
})
export class Video implements OnChanges {
  private readonly webRtc = inject(WebRTCService);
  private streamChanged = new Subject<void>();

  readonly src = input.required<string>();
  readonly video = signal<MediaStream | null>(null);
  readonly poster = signal<string | null>(null);
  readonly classList = signal<string | null>(null);

  ngOnChanges(): void {
    this.streamChanged.next();

    const offer = this.webRtc.start(this.src());
    offer.media.pipe(takeUntil(this.streamChanged)).subscribe((media) => {
      this.video.set(media);
    });
    offer.poster.pipe(takeUntil(this.streamChanged)).subscribe((poster) => {
      this.poster.set(poster);
    });
    offer.health.pipe(takeUntil(this.streamChanged), distinctUntilChanged()).subscribe((status) => {
      this.classList.set(this.toCssClass(status));
    });
  }

  ngOnDestroy(): void {
    this.streamChanged.next();
    this.streamChanged.complete();
    this.webRtc.stop(this.src());
  }

  private toCssClass(health: Status) {
    const classes = 'absolute top-2 right-2 h-1 w-1 rounded-full';
    switch (health) {
      case 'connecting':
        return classes + ' bg-yellow-500';
      case 'offline':
        return classes + ' bg-red-500';
      case 'streaming':
        return classes + ' bg-[#39FF14]';
      case 'stale':
        return classes + ' bg-gray-500';
    }
  }
}
