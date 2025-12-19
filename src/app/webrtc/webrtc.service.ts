import { inject, Injectable, Signal } from '@angular/core';
import { interval } from 'rxjs';
import { StreamOffer, WebRTCStream } from './webrtc';
import { HttpClient } from '@angular/common/http';

/**
 * Manages all WebRTC streams of the dashboard.
 */
@Injectable({ providedIn: 'root' })
export class WebRTCService {
  private readonly httpClient = inject(HttpClient);
  private readonly streams = new Map<string, WebRTCStream>();
  private readonly visibilityFunc = async () => this.onVisibilityChanged();

  private disconnectTimeout: number | undefined = undefined;

  constructor() {
    document.addEventListener('visibilitychange', this.visibilityFunc);
  }

  /**
   * Requests to start a WebRTC stream for the given camera.
   */
  start(cameraName: string): StreamOffer {
    let stream = this.streams.get(cameraName);
    if (!stream) {
      stream = new WebRTCStream(this.httpClient, cameraName);
      this.streams.set(cameraName, stream);
    }
    return stream.createOrResume();
  }

  /**
   * Stops the WebRTC stream for the given camera.
   */
  stop(cameraName: string) {
    let stream = this.streams.get(cameraName);
    if (stream) {
      stream.stop();
    }
  }

  private async onVisibilityChanged() {
    if (document.hidden) {
      clearTimeout(this.disconnectTimeout);
      this.disconnectTimeout = setTimeout(() => {
        this.streams.forEach((stream) => stream.stop());
      }, 10_000);
    } else {
      this.streams.forEach((stream) => stream.createOrResume());
    }
  }
}
