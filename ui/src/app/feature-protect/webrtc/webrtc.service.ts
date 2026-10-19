import { CameraService } from '../../backend/generated/services/camera.service';
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
  private readonly cameraApi = inject(CameraService);
  private readonly debug = inject(DebugService);
  private readonly visibility = inject(VisibilityService);
  private readonly streams = new Map<string, WebRTCStream>();
  private readonly consumers = new Map<string, number>();
  private readonly resumeTimers = new Map<string, ReturnType<typeof setTimeout>>();
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
      stream = new WebRTCStream(this.cameraApi, streamName, this.debug);
      this.streams.set(streamName, stream);
    }

    this.consumers.set(streamName, (this.consumers.get(streamName) ?? 0) + 1);
    clearTimeout(this.resumeTimers.get(streamName));
    this.resumeTimers.delete(streamName);
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
    const count = this.consumers.get(streamName) ?? 0;
    if (count > 1) {
      this.consumers.set(streamName, count - 1);
      return;
    }
    this.consumers.delete(streamName);
    clearTimeout(this.resumeTimers.get(streamName));
    this.resumeTimers.delete(streamName);
    this.streams.get(streamName)?.stop();
  }

  /**
   * Stops all streams when the screen turns off.
   */
  private stopAllStreams() {
    this.resumeTimers.forEach((timer) => clearTimeout(timer));
    this.resumeTimers.clear();
    this.streams.forEach((stream) => stream.stop());
  }

  /**
   * Resumes streams with active viewers when the screen turns on.
   * Add a small delay between starting each stream to avoid overwhelming the system with simultaneous stream startups.
   */
  private startAllStreams() {
    Array.from(this.consumers.keys()).forEach((streamName, index) => {
      clearTimeout(this.resumeTimers.get(streamName));
      const timer = setTimeout(() => {
        this.resumeTimers.delete(streamName);
        if (this.screenOn && this.consumers.has(streamName)) {
          this.streams.get(streamName)?.start();
        }
      }, index * PLAY_DELAY);
      this.resumeTimers.set(streamName, timer);
    });
  }

  private buildStreamName(camera: Camera, quality: StreamQuality) {
    if (quality == 'high') {
      return 'unifi_' + camera;
    }
    return 'unifi_' + camera + '_' + quality;
  }
}
