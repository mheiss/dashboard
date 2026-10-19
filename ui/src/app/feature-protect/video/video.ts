import { Component, ElementRef, inject, input, OnChanges, OnInit, signal, viewChild, ChangeDetectionStrategy } from '@angular/core';
import { distinctUntilChanged, Subject, takeUntil } from 'rxjs';
import { Camera, StreamQuality } from '../protect.model';
import { WebRTCService } from '../webrtc/webrtc.service';
import Panzoom, { PanzoomObject } from '@panzoom/panzoom';
import { Status, StreamReport } from '../webrtc/webrtc.model';

@Component({
  selector: 'app-video',
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './video.html',
})
export class Video implements OnInit, OnChanges {
  private readonly webRtc = inject(WebRTCService);
  readonly camera = input.required<Camera>();
  readonly play = input<boolean>(true);
  readonly zoom = input<boolean>(true);
  readonly fit = input<boolean>(false);
  readonly quality = input<StreamQuality>('high');
  readonly showStats = signal<boolean>(false);

  readonly video = signal<MediaStream | null>(null);
  readonly poster = signal<string | null>(null);
  readonly stats = signal<string | null>(null);
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
      this.panzoom = Panzoom(videoElement, {
        disablePan: true,
        maxScale: 5,
        minScale: 1,
      });
      videoElement.addEventListener('wheel', this.onWheel, { passive: false });
    }
  }

  ngOnChanges(): void {
    this.streamChanged.next();
    this.releaseStream();
    this.panzoom?.reset();
    if (!this.play()) {
      this.video.set(null);
      this.classes.set(null);
      this.statusText.set(null);
      return;
    }
    this.activeStream = { camera: this.camera(), quality: this.quality() };
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
      this.stats.set(this.formatStats(stats));
    });
  }

  ngOnDestroy(): void {
    this.videoElement();
    this.streamChanged.next();
    this.streamChanged.complete();
    this.releaseStream();

    const videoElement = this.videoElement().nativeElement;
    if (videoElement) {
      videoElement.removeEventListener('wheel', this.onWheel);
    }
    this.panzoom?.destroy();
  }

  private releaseStream(): void {
    if (this.activeStream) {
      this.webRtc.stop(this.activeStream.camera, this.activeStream.quality);
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
      `Peer: ${report.connectionState ?? 'n/a'} | ICE: ${report.iceConnectionState ?? 'n/a'}`,
      `Transport: ${report.transport ?? 'n/a'} | Last reconnect: ${report.reconnectReason ?? 'none'}`,
      `Sample: ${report.timestamp ? new Date(report.timestamp).toLocaleTimeString() : 'n/a'}`,
    ].join('\n');
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
