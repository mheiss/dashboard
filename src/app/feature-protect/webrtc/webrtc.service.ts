import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DebugService } from '../../utils/debug.service';
import { VisibilityService } from '../../utils/visibility.service';
import { Camera, PLAY_DELAY, StreamQuality } from '../protect.model';
import { WebRTCStream } from './webrtc';
import { StreamOffer } from './webrtc.model';

/**
 * Manages all WebRTC streams of the dashboard.
 */
@Injectable({ providedIn: 'root' })
export class WebRTCService {
  private readonly httpClient = inject(HttpClient);
  private readonly debug = inject(DebugService);
  private readonly visibility = inject(VisibilityService);
  private readonly streams = new Map<string, WebRTCStream>();
  private screenOn = true;

  constructor() {
    this.visibility.screenOn$.pipe(takeUntilDestroyed()).subscribe((screenOn) => (this.screenOn = screenOn));
    this.visibility.screenOffAgain$.pipe(takeUntilDestroyed()).subscribe(() => this.stopAllStreams());
    this.visibility.screenOnAgain$.pipe(takeUntilDestroyed()).subscribe(() => this.startAllStreams());
  }

  /**
   * Requests to start a WebRTC stream for the given camera.
   */
  start(camera: Camera, quality: StreamQuality = 'medium'): StreamOffer {
    const streamName = this.buildStreamName(camera, quality);
    let stream = this.streams.get(streamName);
    if (!stream) {
      stream = new WebRTCStream(this.httpClient, streamName, this.debug);
      this.streams.set(streamName, stream);
    }

    const offer = stream.start();
    if (!this.screenOn) {
      stream.stop();
    }

    return offer;
  }

  /**
   * Stops the WebRTC stream for the given camera.
   */
  stop(camera: Camera, quality: StreamQuality = 'medium') {
    const streamName = this.buildStreamName(camera, quality);
    let stream = this.streams.get(streamName);
    if (stream) {
      stream.stop();
    }
  }

  /**
   * Stops all streams when the screen turns off.
   */
  private stopAllStreams() {
    this.streams.forEach((stream) => stream.stop());
  }

  /**
   * Starts all known streams again when the screen turns on.
   * Add a small delay between starting each stream to avoid overwhelming the system with simultaneous stream startups.
   */
  private startAllStreams() {
    Array.from(this.streams.values()).forEach((stream, index) => {
      setTimeout(() => stream.start(), index * PLAY_DELAY);
    });
  }

  private buildStreamName(camera: Camera, quality: StreamQuality) {
    if (quality == 'high') {
      return 'unifi_' + camera;
    }
    return 'unifi_' + camera + '_' + quality;
  }
}
