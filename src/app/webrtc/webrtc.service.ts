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

  async ngOnInit() {
    interval(1000).subscribe(async () => {
      // this.streams.forEach(stream => {
      // });
      // this.status.set(await this.determineHealth());
      // if (this.status() === 'stale') {
      //   console.log('%s: Stale video detected, reconnecting.', this.camera());
      //   this.webSocket?.reconnect();
      // }
    });
  }

  async onVisibilityChanged() {
    if (document.hidden) {
      clearTimeout(this.disconnectTimeout);
      this.disconnectTimeout = setTimeout(() => {
        this.streams.forEach((stream) => stream.stop());
      }, 10_000);
    } else {
      this.streams.forEach((stream) => stream.createOrResume());
    }
  }

  // async determineHealth(): Promise<Status> {
  // const wsAlive = this.webSocket?.readyState === WebSocket.OPEN;
  // if (!wsAlive || !this.peerConnection) {
  //   return 'offline';
  // }
  // const stats = await this.peerConnection.getStats();
  // const reports = Array.from(stats.values());
  // const videoReports = reports.filter((r) => r.type === 'inbound-rtp' && r.kind === 'video');
  // if (!videoReports || videoReports.length == 0) {
  //   return 'connecting';
  // }
  // const videoReport = videoReports[0];
  // const framesDecoded = videoReport.framesDecoded ?? 0;
  // const bytesReceived = videoReport.bytesReceived ?? 0;
  // // If no frames/bytes for >2s, mark stale
  // if (this.statusReport) {
  //   const deltaFrames = framesDecoded - this.statusReport.framesDecoded;
  //   const deltaBytes = bytesReceived - this.statusReport.bytesReceived;
  //   const elapsed = Date.now() - this.statusReport.checkTime;
  //   if (elapsed > 2000 && deltaFrames === 0 && deltaBytes === 0) {
  //     return 'stale';
  //   }
  //   return 'streaming';
  // }
  // const checkTime = Date.now();
  // this.statusReport = { bytesReceived, framesDecoded, checkTime };
  // if (bytesReceived == 0) {
  //   return 'connecting';
  // }
  // return 'streaming';
  // }
}
