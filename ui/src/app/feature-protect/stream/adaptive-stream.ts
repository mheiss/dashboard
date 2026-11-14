import { BehaviorSubject, Subscription } from 'rxjs';
import type { DebugService } from '../../utils/debug.service';
import {
  isWebRtcHealthy,
  MSE_GIVE_UP_MS,
  probeBackoff,
  PROBE_TIMEOUT_MS,
  PROMOTE_AFTER_STABLE_MS,
  Stability,
  SWITCH_AFTER_STABLE_MS,
  WEBRTC_TRUSTED_MS,
} from './transport-policy';
import { createEmptyReport, Status, StreamOffer, StreamReport, StreamTransport, TransportMode } from './stream.model';

/** Time that the stream is kept running after the last viewer left. */
const IDLE_STOP_DELAY = 30_000;

/**
 * - idle: nothing is running
 * - mse: MSE delivers the video, WebRTC is not running
 * - probing: MSE delivers the video while WebRTC connects in the background
 * - webrtc: WebRTC delivers the video, MSE is not running
 */
type Phase = 'idle' | 'mse' | 'probing' | 'webrtc';

export interface AdaptiveStreamOptions {
  camera: string;
  webrtc: StreamTransport;
  /** Null when the browser cannot play MSE; the stream then uses WebRTC only. */
  mse: StreamTransport | null;
  loadPoster: () => Promise<Blob>;
  debug: Pick<DebugService, 'log'>;
  now?: () => number;
  /** Disable to drive the evaluation with tick(), e.g. in tests. */
  autoTick?: boolean;
}

/**
 * Delivers a camera with the best transport. MSE starts fast and is robust, WebRTC has the lowest latency.
 * The stream starts with MSE, tries WebRTC in the background once MSE is stable and switches over when
 * WebRTC is healthy. When WebRTC starts buffering, it falls back to MSE and waits before trying again.
 */
export class AdaptiveStream {
  private readonly media = new BehaviorSubject<MediaStream | null>(null);
  private readonly poster = new BehaviorSubject<string | null>(null);
  private readonly status = new BehaviorSubject<Status>('offline');
  private readonly report = new BehaviorSubject<StreamReport>(createEmptyReport());
  private readonly offer: StreamOffer = {
    media: this.media.asObservable(),
    poster: this.poster.asObservable(),
    status: this.status.asObservable(),
    report: this.report.asObservable(),
  };

  private readonly webrtc: StreamTransport;
  private readonly mse: StreamTransport | null;
  private readonly now: () => number;

  private phase: Phase = 'idle';
  private mseEnabled = false;
  private activeSubscription = new Subscription();
  private tickTimer: ReturnType<typeof setInterval> | undefined;
  private stopTimer: ReturnType<typeof setTimeout> | undefined;
  private posterLoading = false;

  private failures = 0;
  private nextProbeAt = 0;
  private probeStartedAt = 0;
  private readonly mseStable = new Stability();
  private readonly mseDown = new Stability();
  private readonly probeStable = new Stability();
  private readonly webrtcStable = new Stability();

  constructor(private readonly options: AdaptiveStreamOptions) {
    this.webrtc = options.webrtc;
    this.mse = options.mse;
    this.now = options.now ?? (() => Date.now());
  }

  /** Starts streaming and returns the observable stream state. */
  start(): StreamOffer {
    clearTimeout(this.stopTimer);
    this.stopTimer = undefined;
    this.refreshPoster();
    if (this.phase === 'idle') {
      this.begin();
    }
    return this.offer;
  }

  /** Schedules the stream to stop after a short idle timeout. */
  stop(): void {
    clearTimeout(this.stopTimer);
    this.stopTimer = setTimeout(() => {
      this.stopTimer = undefined;
      this.shutdown();
    }, IDLE_STOP_DELAY);
  }

  /** Evaluates whether the transport shall change. Runs once per second while streaming. */
  tick(): void {
    const now = this.now();
    switch (this.phase) {
      case 'mse':
        this.tickMse(now);
        break;
      case 'probing':
        this.tickProbe(now);
        break;
      case 'webrtc':
        if (this.webrtcStable.update(this.webrtc.snapshot().status === 'streaming', now) >= WEBRTC_TRUSTED_MS) {
          this.failures = 0;
        }
        break;
    }
  }

  private begin(): void {
    this.failures = 0;
    this.nextProbeAt = 0;
    [this.mseStable, this.mseDown, this.probeStable, this.webrtcStable].forEach((stability) => stability.reset());
    this.mseEnabled = this.mse !== null && this.mse.usable;
    if (this.options.autoTick !== false) {
      this.tickTimer = setInterval(() => this.tick(), 1000);
    }

    if (this.mseEnabled) {
      this.phase = 'mse';
      this.activate('mse');
      this.mse!.start();
    } else {
      this.phase = 'webrtc';
      this.activate('webrtc');
      this.webrtc.start();
    }
  }

  private shutdown(): void {
    clearInterval(this.tickTimer);
    this.tickTimer = undefined;
    this.activeSubscription.unsubscribe();
    this.activeSubscription = new Subscription();
    this.mse?.halt();
    this.webrtc.halt();
    this.phase = 'idle';
    this.media.next(null);
    this.status.next('offline');
    this.report.next(createEmptyReport());
  }

  private tickMse(now: number): void {
    const mse = this.mse!;
    if (!mse.usable) {
      this.disableMse();
      return;
    }

    const streaming = mse.snapshot().status === 'streaming';
    const stableMs = this.mseStable.update(streaming, now);
    const downMs = this.mseDown.update(!streaming, now);
    if (now < this.nextProbeAt) {
      return;
    }
    // MSE that delivers nothing is no reason to wait: WebRTC may work where MSE does not.
    if (stableMs >= PROMOTE_AFTER_STABLE_MS || downMs >= MSE_GIVE_UP_MS) {
      this.startProbe(now);
    }
  }

  private tickProbe(now: number): void {
    const mseWorking = this.mse!.usable && this.mse!.snapshot().status === 'streaming';
    const rtc = this.webrtc.snapshot();
    const streaming = rtc.status === 'streaming';
    const stableMs = this.probeStable.update(streaming && isWebRtcHealthy(rtc.report), now);

    if (stableMs >= SWITCH_AFTER_STABLE_MS || (!mseWorking && streaming)) {
      this.switchToWebRtc();
    } else if (now - this.probeStartedAt > PROBE_TIMEOUT_MS) {
      this.abortProbe(now, mseWorking);
    }
  }

  private startProbe(now: number): void {
    this.options.debug.log('%s: Trying WebRTC in the background.', this.options.camera);
    this.phase = 'probing';
    this.probeStartedAt = now;
    this.probeStable.reset();
    this.webrtc.start();
  }

  private abortProbe(now: number, mseWorking: boolean): void {
    this.options.debug.log('%s: WebRTC is not healthy, staying with MSE.', this.options.camera);
    this.phase = 'mse';
    this.webrtc.halt();
    // A probe that failed while MSE was down says nothing about the quality of WebRTC.
    if (mseWorking) {
      this.failures++;
    }
    this.nextProbeAt = now + probeBackoff(mseWorking ? this.failures : 1);
    this.mseStable.reset();
    this.mseDown.reset();
  }

  private switchToWebRtc(): void {
    this.options.debug.log('%s: Switching from MSE to WebRTC.', this.options.camera);
    this.phase = 'webrtc';
    this.webrtcStable.reset();
    this.activate('webrtc');
    this.mse!.halt();
  }

  private fallbackToMse(status: Status): void {
    this.options.debug.log('%s: WebRTC is %s, falling back to MSE.', this.options.camera, status);
    this.failures++;
    this.nextProbeAt = this.now() + probeBackoff(this.failures);
    this.mseStable.reset();
    this.mseDown.reset();
    this.phase = 'mse';
    this.activate('mse');
    this.webrtc.halt();
    this.mse!.start();
    this.refreshPoster();
  }

  /** The browser cannot play what the camera sends over MSE, so WebRTC takes over for good. */
  private disableMse(): void {
    this.options.debug.log('%s: MSE is not usable, using WebRTC only.', this.options.camera);
    this.mseEnabled = false;
    this.phase = 'webrtc';
    this.activate('webrtc');
    this.webrtc.start();
  }

  /** Publishes the state of the given transport. */
  private activate(mode: TransportMode): void {
    this.activeSubscription.unsubscribe();
    this.activeSubscription = new Subscription();
    const state = (mode === 'mse' ? this.mse! : this.webrtc).state;
    this.activeSubscription.add(state.media.subscribe((media) => this.media.next(media)));
    this.activeSubscription.add(state.status.subscribe((status) => this.onActiveStatus(mode, status)));
    this.activeSubscription.add(state.report.subscribe((report) => this.report.next({ ...report, mode })));
  }

  private onActiveStatus(mode: TransportMode, status: Status): void {
    this.status.next(status);
    if (mode === 'webrtc' && this.phase === 'webrtc' && this.mseEnabled && status !== 'streaming') {
      this.fallbackToMse(status);
    }
  }

  /** Loads the latest camera frame, which is shown until the video plays. */
  private refreshPoster(): void {
    // A live stream does not show the poster, and overlapping requests only waste bandwidth.
    if (this.posterLoading || this.status.value === 'streaming') {
      return;
    }

    this.posterLoading = true;
    this.options
      .loadPoster()
      .then((blob) => {
        const previous = this.poster.value;
        this.poster.next(URL.createObjectURL(blob));
        if (previous) {
          URL.revokeObjectURL(previous);
        }
      })
      .catch((error) => this.options.debug.log('%s: Camera poster request failed. %s', this.options.camera, error))
      .finally(() => (this.posterLoading = false));
  }
}
