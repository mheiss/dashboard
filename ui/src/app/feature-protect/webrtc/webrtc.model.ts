import { Observable } from 'rxjs';

/**
 * Health status of the stream.
 */
export type Status = 'offline' | 'connecting' | 'connected' | 'startup' | 'buffering' | 'streaming' | 'dead';

/**
 * The video stream along with some metadata.
 */
export interface StreamOffer {
  media: Observable<MediaStream | null>;
  poster: Observable<string | null>;
  status: Observable<Status>;
  report: Observable<StreamReport>;
}

/**
 * Status report of a stream.
 */
export interface StreamReport {
  frames: number;
  bytes: number;
  timestamp: number;
  fps: number | null;
  bitrate: number | null;
  packetsLost: number | null;
  packetsReceived: number | null;
  framesDropped: number | null;
  jitterMs: number | null;
  roundTripTimeMs: number | null;
  decodeTimeMs: number | null;
  jitterBufferDelayMs: number | null;
  pliCount: number | null;
  nackCount: number | null;
  transport: string | null;
  connectionState: RTCPeerConnectionState | null;
  iceConnectionState: RTCIceConnectionState | null;
  reconnectReason: string | null;
}

/**
 * Returns an empty stream report with default values.
 */
export function createEmptyReport(): StreamReport {
  return {
    ...createStreamReport(0, 0),
    timestamp: 0,
  };
}

/**
 * Returns a new stream report with the given values.
 */
export function createStreamReport(frames: number, bytes: number, diagnostics: Partial<StreamReport> = {}): StreamReport {
  return {
    frames: frames,
    bytes: bytes,
    timestamp: Date.now(),
    fps: null,
    bitrate: null,
    packetsLost: null,
    packetsReceived: null,
    framesDropped: null,
    jitterMs: null,
    roundTripTimeMs: null,
    decodeTimeMs: null,
    jitterBufferDelayMs: null,
    pliCount: null,
    nackCount: null,
    transport: null,
    connectionState: null,
    iceConnectionState: null,
    reconnectReason: null,
    ...diagnostics,
  };
}
