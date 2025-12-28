import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Camera, StreamQuality } from '../models/dashboard.model';
import { StreamOffer, WebRTCStream } from './webrtc';

/**
 * Manages all WebRTC streams of the dashboard.
 */
@Injectable({ providedIn: 'root' })
export class WebRTCService {
  private readonly httpClient = inject(HttpClient);
  private readonly streams = new Map<string, WebRTCStream>();
  private readonly visibilityFunc = async () => this.onVisibilityChanged();

  constructor() {
    document.addEventListener('visibilitychange', this.visibilityFunc);
  }

  /**
   * Requests to start a WebRTC stream for the given camera.
   */
  start(camera: Camera, quality: StreamQuality = 'medium'): StreamOffer {
    const streamName = this.buildStreamName(camera, quality);
    let stream = this.streams.get(streamName);
    if (!stream) {
      stream = new WebRTCStream(this.httpClient, streamName);
      this.streams.set(streamName, stream);
    }
    return stream.start();
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
   * Starts / Stops the stream depending on the visibility of the document
   */
  private async onVisibilityChanged() {
    if (document.hidden) {
      this.streams.forEach((stream) => stream.stop());
    } else {
      this.streams.forEach((stream) => stream.start());
    }
  }

  private buildStreamName(camera: Camera, quality: StreamQuality) {
    if (quality == 'high') {
      return 'unifi_' + camera;
    }
    return 'unifi_' + camera + '_' + quality;
  }
}
