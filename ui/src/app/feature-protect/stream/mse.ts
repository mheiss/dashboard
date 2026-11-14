import { BehaviorSubject } from 'rxjs';
import { DebugService } from '../../utils/debug.service';
import { getWebSocketUrl } from '../../utils/webSocket';
import { createEmptyReport, createStreamReport, Status, StreamReport, StreamTransport, TransportState } from './stream.model';

/** Video codecs offered to go2rtc, in order of preference. */
const CODECS = [
  'avc1.640029', // H.264 high 4.1
  'avc1.64002A', // H.264 high 4.2
  'avc1.640033', // H.264 high 5.1
  'hvc1.1.6.L153.B0', // H.265 main 5.1
];

const RECONNECT_DELAY = 2_000;
const BUFFER_TIMEOUT = 10_000;
const STALE_TIMEOUT = 5_000;
const STARTUP_TIMEOUT = 20_000;
const HEALTH_STALL_GRACE = 2_000;

/**
 * Seconds of video that are kept behind the playhead. Removing media also drops all frames that depend on it up to
 * the next keyframe, and cameras may send a keyframe only every few seconds. Trimming right behind the playhead
 * would therefore remove the group of pictures that is playing and freeze the video.
 */
const KEPT_BEHIND = 30;
const MAX_PENDING_BYTES = 16 * 1024 * 1024;

type CapturingVideo = HTMLVideoElement & { captureStream(): MediaStream };

/**
 * Streams a camera as fragmented MP4 over a WebSocket (Media Source Extensions).
 * The picture is played in a hidden video element and published as a MediaStream, so that multiple
 * views can show it and it can be swapped with a WebRTC stream without the views noticing.
 */
export class MseStream implements StreamTransport {
  private readonly media = new BehaviorSubject<MediaStream | null>(null);
  private readonly status = new BehaviorSubject<Status>('offline');
  private readonly streamReport = new BehaviorSubject<StreamReport>(createEmptyReport());
  readonly state: TransportState = {
    media: this.media.asObservable(),
    status: this.status.asObservable(),
    report: this.streamReport.asObservable(),
  };

  private started = false;
  private unsupported = false;
  private requested = false;
  private socket: WebSocket | null = null;
  private video: CapturingVideo | null = null;
  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private objectUrl: string | null = null;
  private pending: ArrayBuffer[] = [];
  private pendingBytes = 0;
  private healthTimer: ReturnType<typeof setInterval> | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  private openedAt = 0;
  private bytes = 0;
  private gapMs: number | null = null;
  private hasFrames = false;
  private staleSince: number | null = null;
  private bufferingSince: number | null = null;
  private lastReconnectReason: string | null = null;

  constructor(
    private camera: string,
    private debug: DebugService,
  ) {}

  /** MSE output is published through captureStream, which Safari does not offer. */
  static isSupported(): boolean {
    return typeof MediaSource !== 'undefined' && typeof HTMLVideoElement !== 'undefined' && 'captureStream' in HTMLVideoElement.prototype;
  }

  get usable(): boolean {
    return !this.unsupported;
  }

  snapshot() {
    return { status: this.status.value, report: this.streamReport.value };
  }

  start(): void {
    if (this.started || this.unsupported) {
      return;
    }
    this.started = true;
    this.healthTimer = setInterval(() => this.checkHealth(), 1000);
    this.open();
  }

  halt(): void {
    this.started = false;
    clearInterval(this.healthTimer);
    this.healthTimer = undefined;
    this.closeConnection();
    this.media.next(null);
    this.resetHealthState();
    this.streamReport.next(createEmptyReport());
    this.status.next('offline');
  }

  private open(): void {
    this.closeConnection();
    this.resetHealthState();
    this.requested = false;
    this.openedAt = Date.now();
    this.status.next('connecting');

    const video = document.createElement('video') as CapturingVideo;
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute('aria-hidden', 'true');
    // Keeps the element rendering, which hidden or detached video elements may not do.
    video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;';
    video.addEventListener('error', () => {
      if (this.video === video) this.reconnect('Video error');
    });
    video.addEventListener(
      'playing',
      () => {
        if (this.video === video) this.media.next(video.captureStream());
      },
      { once: true },
    );
    document.body.appendChild(video);
    this.video = video;

    const mediaSource = new MediaSource();
    this.mediaSource = mediaSource;
    mediaSource.addEventListener('sourceopen', () => this.requestStream(), { once: true });
    this.objectUrl = URL.createObjectURL(mediaSource);
    video.src = this.objectUrl;
    video.play().catch(() => undefined);

    const socket = new WebSocket(getWebSocketUrl('/api/ws/webrtc?src=' + encodeURIComponent(this.camera)));
    socket.binaryType = 'arraybuffer';
    socket.onopen = () => this.requestStream();
    socket.onmessage = (event) => (typeof event.data === 'string' ? this.onMessage(event.data) : this.onData(event.data));
    socket.onclose = () => {
      if (this.socket === socket) this.reconnect('Socket closed');
    };
    this.socket = socket;
  }

  /** Asks for the stream as soon as both the socket and the media source are ready. */
  private requestStream(): void {
    // The sourceopen event is dispatched after the state changed, so both triggers can find everything ready.
    if (this.requested || this.socket?.readyState !== WebSocket.OPEN || this.mediaSource?.readyState !== 'open') {
      return;
    }
    this.requested = true;
    const codecs = CODECS.filter((codec) => MediaSource.isTypeSupported(`video/mp4; codecs="${codec}"`)).join();
    this.socket.send(JSON.stringify({ type: 'mse', value: codecs }));
  }

  private onMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      if (message.type === 'mse') {
        this.createSourceBuffer(message.value);
      } else if (message.type === 'error') {
        this.debug.log('%s: MSE signaling error: %s', this.camera, message.value);
        this.reconnect('Signaling error');
      }
    } catch (error) {
      this.debug.log('%s: MSE message failed. %s', this.camera, error);
      this.reconnect('Message failed');
    }
  }

  private createSourceBuffer(mimeType: string): void {
    const mediaSource = this.mediaSource;
    if (!mediaSource || this.sourceBuffer) {
      return;
    }
    try {
      const sourceBuffer = mediaSource.addSourceBuffer(mimeType);
      sourceBuffer.mode = 'segments';
      sourceBuffer.addEventListener('updateend', () => this.onUpdateEnd());
      this.sourceBuffer = sourceBuffer;
      this.debug.log('%s: MSE stream with codecs %s.', this.camera, mimeType);
    } catch (error) {
      // The browser cannot play what the camera sends, so reconnecting would not help.
      this.debug.log('%s: MSE is not usable. %s', this.camera, error);
      this.unsupported = true;
      this.halt();
    }
  }

  private onData(data: ArrayBuffer): void {
    this.bytes += data.byteLength;
    this.pending.push(data);
    this.pendingBytes += data.byteLength;
    if (this.pendingBytes > MAX_PENDING_BYTES) {
      this.reconnect('Backlog');
      return;
    }
    this.appendNext();
  }

  private appendNext(): void {
    const sourceBuffer = this.sourceBuffer;
    if (!sourceBuffer || sourceBuffer.updating || !this.pending.length) {
      return;
    }
    const data = this.pending[0];
    try {
      sourceBuffer.appendBuffer(data);
      this.pending.shift();
      this.pendingBytes -= data.byteLength;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        // The rejected data stays queued and is appended after the removal finished.
        if (!this.trimBuffer(10, 0.1)) {
          this.reconnect('Buffer full');
        }
      } else {
        this.debug.log('%s: MSE append failed. %s', this.camera, error);
        this.reconnect('Append failed');
      }
    }
  }

  /** Appends queued data and keeps the player close to the live edge. */
  private onUpdateEnd(): void {
    const sourceBuffer = this.sourceBuffer;
    const video = this.video;
    if (!sourceBuffer || !video) {
      return;
    }
    this.appendNext();
    if (sourceBuffer.updating || !sourceBuffer.buffered.length) {
      return;
    }
    // Trim in larger steps; the removal is followed by another updateend.
    if (this.trimBuffer(KEPT_BEHIND, 5)) {
      return;
    }

    const start = sourceBuffer.buffered.start(0);
    const end = sourceBuffer.buffered.end(sourceBuffer.buffered.length - 1);
    if (this.mediaSource?.readyState === 'open') {
      this.mediaSource.setLiveSeekableRange(start, end);
    }
    if (video.currentTime < start) {
      video.currentTime = start;
    }
    const gap = end - video.currentTime;
    this.gapMs = Math.max(gap, 0) * 1000;
    // Play slower when the buffer runs dry and faster to catch up with the live edge.
    video.playbackRate = Math.min(Math.max(gap, 0.5), 2);
  }

  /** Removes media that is more than the given seconds behind the playhead, if at least minSeconds can be removed. */
  private trimBuffer(behindSeconds: number, minSeconds: number): boolean {
    const sourceBuffer = this.sourceBuffer;
    const video = this.video;
    if (!sourceBuffer || !video || sourceBuffer.updating || !sourceBuffer.buffered.length) {
      return false;
    }
    const start = sourceBuffer.buffered.start(0);
    const keepFrom = video.currentTime - behindSeconds;
    if (keepFrom - start < minSeconds) {
      return false;
    }
    sourceBuffer.remove(start, keepFrom);
    return true;
  }

  /** Updates the stream status from the playback statistics. */
  private checkHealth(): void {
    const video = this.video;
    if (!this.started || !video || this.reconnectTimer !== undefined) {
      return;
    }

    const now = Date.now();
    const previous = this.streamReport.value;
    const quality = video.getVideoPlaybackQuality();
    const frames = quality.totalVideoFrames - quality.droppedVideoFrames;
    const seconds = previous.timestamp ? (now - previous.timestamp) / 1000 : 0;
    const deltaFrames = frames - previous.frames;
    const deltaBytes = this.bytes - previous.bytes;
    this.streamReport.next(
      createStreamReport(frames, this.bytes, {
        fps: seconds > 0 && deltaFrames >= 0 ? deltaFrames / seconds : null,
        bitrate: seconds > 0 && deltaBytes >= 0 ? (deltaBytes * 8) / seconds : null,
        framesDropped: quality.droppedVideoFrames,
        jitterBufferDelayMs: this.gapMs,
        connectionState: null,
        transport: 'websocket',
        reconnectReason: this.lastReconnectReason,
      }),
    );

    if (deltaFrames > 0) {
      this.hasFrames = true;
      this.staleSince = null;
      this.bufferingSince = null;
      this.setStatus('streaming');
      return;
    }

    if (!this.hasFrames) {
      this.setStatus(this.sourceBuffer ? 'startup' : 'connecting');
      if (now - this.openedAt > STARTUP_TIMEOUT) {
        this.reconnect('Startup timeout');
      }
      return;
    }

    if (deltaBytes > 0) {
      this.staleSince = null;
      this.bufferingSince ??= now;
      if (now - this.bufferingSince >= HEALTH_STALL_GRACE) {
        this.setStatus('buffering');
      }
      if (now - this.bufferingSince > BUFFER_TIMEOUT) {
        this.reconnect('Buffering timeout');
      }
      return;
    }

    this.staleSince ??= now;
    if (now - this.staleSince >= HEALTH_STALL_GRACE) {
      this.setStatus('dead');
    }
    if (now - this.staleSince > STALE_TIMEOUT) {
      this.reconnect('Stream dead');
    }
  }

  private setStatus(status: Status): void {
    if (this.status.value !== status) {
      this.status.next(status);
    }
  }

  private reconnect(reason: string): void {
    if (!this.started || this.reconnectTimer !== undefined) {
      return;
    }
    this.debug.log('%s: Reconnecting MSE stream (%s).', this.camera, reason);
    this.lastReconnectReason = reason;
    this.closeConnection();
    this.media.next(null);
    this.setStatus('connecting');
    const delay = Math.max(RECONNECT_DELAY - (Date.now() - this.openedAt), 0);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (this.started) this.open();
    }, delay);
  }

  private resetHealthState(): void {
    this.bytes = 0;
    this.gapMs = null;
    this.hasFrames = false;
    this.staleSince = null;
    this.bufferingSince = null;
    this.streamReport.next({ ...createEmptyReport(), reconnectReason: this.lastReconnectReason });
  }

  /** Releases the socket, the media source and the hidden video element. */
  private closeConnection(): void {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;

    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onopen = socket.onmessage = socket.onclose = null;
      socket.close();
    }

    const video = this.video;
    this.video = null;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.remove();
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.pending = [];
    this.pendingBytes = 0;
  }
}
