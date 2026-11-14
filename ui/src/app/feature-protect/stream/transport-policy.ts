import type { StreamReport } from './stream.model';

/** MSE must deliver frames this long without interruption before WebRTC is tried in the background. */
export const PROMOTE_AFTER_STABLE_MS = 10_000;

/** A WebRTC probe must be healthy this long before the video is switched over. */
export const SWITCH_AFTER_STABLE_MS = 3_000;

/** A probe that is not healthy after this time is aborted. */
export const PROBE_TIMEOUT_MS = 20_000;

/** When MSE delivers nothing for this long, WebRTC is started without waiting for MSE to become stable. */
export const MSE_GIVE_UP_MS = 8_000;

/** WebRTC that streamed this long without a fallback is trusted, so the probe back-off is reset. */
export const WEBRTC_TRUSTED_MS = 60_000;

const PROBE_BACKOFF_BASE_MS = 30_000;
const PROBE_BACKOFF_MAX_MS = 300_000;

/** Delay before WebRTC is tried again after the given number of failed attempts. */
export function probeBackoff(failures: number): number {
  return Math.min(PROBE_BACKOFF_BASE_MS * 2 ** Math.max(failures - 1, 0), PROBE_BACKOFF_MAX_MS);
}

/**
 * Whether the network path of a WebRTC stream is good enough to carry the video.
 * Counters are cumulative for the connection, so they describe the time since the probe started.
 */
export function isWebRtcHealthy(report: StreamReport): boolean {
  const lost = Math.max(report.packetsLost ?? 0, 0);
  const received = report.packetsReceived ?? 0;
  if (lost + received > 0 && lost / (lost + received) > 0.02) {
    return false;
  }
  if (report.jitterMs !== null && report.jitterMs > 50) {
    return false;
  }
  const dropped = report.framesDropped ?? 0;
  if (report.frames > 0 && dropped / (report.frames + dropped) > 0.05) {
    return false;
  }
  if (report.fps !== null && report.fps < 5) {
    return false;
  }
  // The browser only knows the incoming bandwidth estimate for some connections.
  if (report.availableBitrate !== null && report.bitrate !== null && report.availableBitrate < report.bitrate * 1.5) {
    return false;
  }
  return true;
}

/** Measures for how long a condition has held without interruption. */
export class Stability {
  private since: number | null = null;

  /** Records the condition and returns how long it has been true, 0 when it is false. */
  update(ok: boolean, now: number): number {
    if (!ok) {
      this.since = null;
      return 0;
    }
    this.since ??= now;
    return now - this.since;
  }

  reset(): void {
    this.since = null;
  }
}
