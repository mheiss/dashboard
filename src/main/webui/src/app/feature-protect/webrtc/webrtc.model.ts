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
}

/**
 * Returns an empty stream report with default values.
 */
export function createEmptyReport(): StreamReport {
  return {
    frames: 0,
    bytes: 0,
    timestamp: 0,
  };
}

/**
 * Returns a new stream report with the given values.
 */
export function createStreamReport(frames: number, bytes: number): StreamReport {
  return {
    frames: frames,
    bytes: bytes,
    timestamp: Date.now(),
  };
}
