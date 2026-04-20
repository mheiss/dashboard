import { Observable } from "rxjs";

/**
 * Health status of the stream.
 */
export type Status = 'offline' | 'connecting' | 'connected' | 'streaming' | 'stale';

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
