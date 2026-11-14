import { Component, computed, ElementRef, inject, input, OnChanges, OnInit, signal, viewChild, ChangeDetectionStrategy } from '@angular/core';
import { distinctUntilChanged, Subject, takeUntil } from 'rxjs';
import { Camera, StreamQuality } from '../protect.model';
import { StreamService } from '../stream/stream.service';
import { PanzoomObject } from '@panzoom/panzoom';
import { Status, StreamReport } from '../stream/stream.model';
import { cameraZoom } from '../camera-zoom';
import { PopupService } from '../../popup/popup.service';
import { VideoViewer } from '../viewer/viewer';

@Component({
  selector: 'app-video',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './video.html',
})
export class Video implements OnInit, OnChanges {
  private readonly streams = inject(StreamService);
  private readonly popup = inject(PopupService);
  readonly camera = input.required<Camera>();
  readonly play = input<boolean>(true);
  readonly zoom = input<boolean>(true);
  readonly fit = input<boolean>(false);
  readonly quality = input<StreamQuality>('high');
  /** Shows the camera name with the status badge and transport in a bar at the bottom, for small previews. */
  readonly label = input<string | null>(null);
  readonly showStats = signal<boolean>(false);

  readonly video = signal<MediaStream | null>(null);
  readonly poster = signal<string | null>(null);
  private readonly report = signal<StreamReport | null>(null);
  // Computed lazily, so the text is only formatted while the diagnostics panel is open.
  readonly stats = computed(() => {
    const report = this.report();
    return report ? this.formatStats(report) : null;
  });
  // Only changes when the transport switches, so the per-second reports do not re-render the view.
  readonly mode = computed(() => {
    switch (this.report()?.mode) {
      case 'webrtc':
        return 'RTC';
      case 'mse':
        return 'MSE';
      default:
        return null;
    }
  });
  readonly classes = signal<string | null>(null);
  readonly statusText = signal<string | null>(null);

  readonly videoElement = viewChild.required<ElementRef<HTMLVideoElement>>('videoElement');
  private streamChanged = new Subject<void>();
  private activeStream: { camera: Camera; quality: StreamQuality } | null = null;
  private panzoom: PanzoomObject;

  private readonly onWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.panzoom.zoomWithWheel(event);
  };

  ngOnInit(): void {
    if (this.zoom()) {
      const videoElement = this.videoElement().nativeElement;
      this.panzoom = cameraZoom(videoElement, this.fit() ? { pan: true, touchAction: 'none' } : {});
      videoElement.addEventListener('wheel', this.onWheel, { passive: false });
    }
  }

  ngOnChanges(): void {
    this.streamChanged.next();
    this.releaseStream();
    this.panzoom?.reset();
    if (!this.play()) {
      this.video.set(null);
      this.report.set(null);
      this.classes.set(null);
      this.statusText.set(null);
      return;
    }
    this.activeStream = { camera: this.camera(), quality: this.quality() };
    const offer = this.streams.start(this.camera(), this.quality());
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
    offer.report.pipe(takeUntil(this.streamChanged)).subscribe((report) => {
      this.report.set(report);
    });
  }

  openMobileViewer(): void {
    if (!window.matchMedia('(max-width: 767px)').matches) {
      return;
    }

    this.popup.open(VideoViewer, {
      data: {
        kind: 'video',
        stream: this.video,
        poster: this.poster,
        statusText: this.statusText,
      },
      fullScreen: true,
      disableClose: false,
    });
  }

  ngOnDestroy(): void {
    this.streamChanged.next();
    this.streamChanged.complete();
    this.releaseStream();

    this.videoElement().nativeElement.removeEventListener('wheel', this.onWheel);
    this.panzoom?.destroy();
  }

  private releaseStream(): void {
    if (this.activeStream) {
      this.streams.stop(this.activeStream.camera, this.activeStream.quality);
      this.activeStream = null;
    }
  }

  private formatStats(report: StreamReport): string {
    const metric = (value: number | null, unit: string, digits = 1) => (value === null ? 'n/a' : value.toFixed(digits) + unit);
    return [
      `FPS: ${metric(report.fps, '')} | Bitrate: ${metric(report.bitrate === null ? null : report.bitrate / 1000, ' kbps')}`,
      `Frames: ${report.frames} | Bytes: ${report.bytes}`,
      `Lost / received packets (total): ${metric(report.packetsLost, '', 0)} / ${metric(report.packetsReceived, '', 0)}`,
      `Dropped frames (total): ${metric(report.framesDropped, '', 0)} | PLI / NACK: ${metric(report.pliCount, '', 0)} / ${metric(report.nackCount, '', 0)}`,
      `Jitter: ${metric(report.jitterMs, ' ms')} | RTT: ${metric(report.roundTripTimeMs, ' ms')}`,
      `Decode: ${metric(report.decodeTimeMs, ' ms/frame')} | Jitter buffer: ${metric(report.jitterBufferDelayMs, ' ms')}`,
      `Mode: ${report.mode ?? 'n/a'} | Peer: ${report.connectionState ?? 'n/a'} | ICE: ${report.iceConnectionState ?? 'n/a'}`,
      `Transport: ${report.transport ?? 'n/a'} | Available: ${metric(report.availableBitrate === null ? null : report.availableBitrate / 1000, ' kbps', 0)} | Last reconnect: ${report.reconnectReason ?? 'none'}`,
      `Sample: ${report.timestamp ? new Date(report.timestamp).toLocaleTimeString() : 'n/a'}`,
    ].join('\n');
  }

  private toCssClass(health: Status) {
    switch (health) {
      case 'offline':
        return 'bg-red-500';
      case 'connecting':
        return 'bg-yellow-500';
      case 'connected':
        return 'bg-blue-500';
      case 'startup':
        return 'bg-sky-400';
      case 'buffering':
        return 'bg-amber-500';
      case 'streaming':
        return 'bg-blue-400';
      case 'dead':
        return 'bg-red-500';
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
