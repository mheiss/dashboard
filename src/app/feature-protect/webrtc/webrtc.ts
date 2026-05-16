import { HttpClient } from '@angular/common/http';
import { WebSocket } from 'partysocket';
import { BehaviorSubject, interval } from 'rxjs';
import { DebugService } from '../../utils/debug.service';
import { getWebSocketUrl } from '../../utils/webSocket';
import { Status, StreamOffer, StreamReport } from './webrtc.model';

export class WebRTCStream {
  private readonly webSocket: WebSocket;
  private peerConnection: RTCPeerConnection | null = null;

  private readonly media = new BehaviorSubject<MediaStream | null>(null);
  private readonly poster = new BehaviorSubject<string | null>(null);
  private readonly status = new BehaviorSubject<Status>('offline');
  private readonly streamReport = new BehaviorSubject<StreamReport>(this.createEmptyReport());

  private stopTimer: number | undefined = undefined;
  private shallStream = false;
  private reconnectPending = false;
  private healthCheckRunning = false;
  private staleSince: number | null = null;
  private connectedSince: number | null = null;
  private bufferingSince: number | null = null;

  constructor(
    private httpClient: HttpClient,
    private camera: string,
    private debug: DebugService,
  ) {
    this.webSocket = new WebSocket(getWebSocketUrl('/ws/webrtc?src=' + camera));
    this.webSocket.onopen = async () => this.onWebSocketOpen();
    this.webSocket.onclose = async (e) => this.onWebSocketClose(e);
    this.webSocket.onmessage = (e) => this.onWebSocketMessage(e);
    this.webSocket.onerror = (e) => this.onWebSocketError(e);
    this.webSocket.binaryType = 'arraybuffer';

    interval(1000).subscribe(() => this.checkHealth());
  }

  /** Starts streaming and returns the observable stream state. */
  start(): StreamOffer {
    // Disable any stop attempts
    clearTimeout(this.stopTimer);
    this.stopTimer = undefined;

    // establish connection if we do not have a connection
    this.updatePoster();
    this.shallStream = true;
    if (this.shouldReconnectOnStart()) {
      this.requestReconnect('Start requested');
    }

    return {
      media: this.media.asObservable(),
      status: this.status.asObservable(),
      poster: this.poster.asObservable(),
      report: this.streamReport.asObservable(),
    };
  }

  /** Schedules the stream to stop after a short idle timeout. */
  stop() {
    clearTimeout(this.stopTimer);
    this.stopTimer = setTimeout(() => {
      this.stopTimer = undefined;
      this.shallStream = false;
      this.reconnectPending = false;
      this.resetHealthState();
      this.webSocket.close();
    }, 30_000);
  }

  /** Creates an empty baseline report for health tracking. */
  private createEmptyReport(): StreamReport {
    return { bytes: 0, frames: 0, timestamp: 0 };
  }

  /** Checks whether the socket is open and the peer connection exists. */
  private hasOpenConnection(): boolean {
    return this.webSocket.readyState === WebSocket.OPEN && this.peerConnection !== null;
  }

  /** Decides whether start should trigger a reconnect attempt. */
  private shouldReconnectOnStart(): boolean {
    return this.webSocket.readyState !== WebSocket.OPEN && this.webSocket.readyState !== WebSocket.CONNECTING && !this.reconnectPending;
  }

  /** Returns whether the current health-check cycle should be skipped. */
  private shouldSkipHealthCheck(): boolean {
    return this.healthCheckRunning || this.reconnectPending || !this.shallStream || !this.hasOpenConnection();
  }

  /** Returns whether an in-flight health-check result should be ignored. */
  private shouldAbortHealthCheck(): boolean {
    return this.reconnectPending || !this.shallStream || !this.hasOpenConnection();
  }

  /** Clears stale tracking and resets the current stream report. */
  private resetHealthState() {
    this.staleSince = null;
    this.bufferingSince = null;
    this.connectedSince = null;
    this.streamReport.next(this.createEmptyReport());
  }

  /** Stops and disposes the current peer connection if present. */
  private cleanupPeerConnection() {
    if (!this.peerConnection) {
      return;
    }

    this.peerConnection.getSenders().forEach((sender) => {
      this.peerConnection?.removeTrack(sender);
      sender.track?.stop();
    });
    this.peerConnection.close();
    this.peerConnection = null;
  }

  /** Marks the stream as offline and clears transient state. */
  private markStreamOffline() {
    this.media.next(null);
    this.resetHealthState();
    this.status.next('offline');
  }

  /** Starts a single reconnect flow when streaming should continue. */
  private requestReconnect(reason: string) {
    if (!this.shallStream || this.reconnectPending) {
      return;
    }

    this.reconnectPending = true;
    this.resetHealthState();
    this.status.next('connecting');
    this.debug.log('%s: Reconnecting WebRTC stream (%s).', this.camera, reason);

    if (this.webSocket.readyState === WebSocket.CLOSED) {
      this.webSocket.reconnect();
      return;
    }

    if (this.webSocket.readyState === WebSocket.CLOSING) {
      return;
    }

    this.webSocket.close();
  }

  /** Fetches and updates the latest poster image for the camera. */
  private updatePoster() {
    this.httpClient.get(`/api/webrtc/frame.jpeg?src=${this.camera}`, { responseType: 'blob' }).subscribe((blob) => {
      const oldValue = this.poster.getValue();
      this.poster.next(URL.createObjectURL(blob));
      if (oldValue) {
        URL.revokeObjectURL(oldValue);
      }
    });
  }

  /** Creates a fresh peer connection when the signaling socket opens. */
  private async onWebSocketOpen() {
    if (!this.shallStream) {
      this.webSocket.close();
      return;
    }

    this.reconnectPending = false;
    this.resetHealthState();
    this.status.next('connecting');

    // Peer connection with LAN/VPN only, no public STUN/TURN
    this.cleanupPeerConnection();
    this.peerConnection = new RTCPeerConnection({ iceServers: [] });
    this.peerConnection.addTransceiver('video', { direction: 'recvonly' });
    this.peerConnection.onicecandidate = (event) => this.onIceCandidate(event);
    this.peerConnection.ontrack = (ev) => this.onTrack(ev);

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    const sdp = this.peerConnection.localDescription?.sdp;
    if (sdp) {
      this.webSocket.send(JSON.stringify({ type: 'webrtc/offer', value: sdp }));
    }

    this.debug.log('%s: Starting a new WebRTC connection.', this.camera);
  }

  /** Cleans up the current connection and reconnects when required. */
  private async onWebSocketClose(e: CloseEvent) {
    this.reconnectPending = false;
    this.cleanupPeerConnection();
    this.markStreamOffline();

    if (this.shallStream) {
      this.debug.log('%s: Socket closed. Reason: %s (Code: %s)', this.camera, e.reason, e.code);
      this.requestReconnect('Socket closed');
      return;
    }

    this.reconnectPending = false;
    this.debug.log('%s: Closed WebRTC connection and stopped streaming.', this.camera);
  }

  /** Logs unexpected signaling socket errors. */
  private async onWebSocketError(e: any) {
    this.debug.log('%s: Unexpected error. Reason: %s', this.camera, e);
  }

  /** Applies incoming signaling messages to the peer connection. */
  private async onWebSocketMessage(msg: MessageEvent) {
    if (!this.peerConnection) {
      this.debug.log('%s: Ignoring signaling message without peer connection.', this.camera);
      return;
    }
    const data = JSON.parse(msg.data);
    switch (data.type) {
      case 'webrtc/candidate':
        const candidate = new RTCIceCandidate({ candidate: data.value, sdpMid: '0' });
        await this.peerConnection.addIceCandidate(candidate);
        break;
      case 'webrtc/answer':
        const remoteDesc = { type: 'answer', sdp: data.value } as RTCSessionDescriptionInit;
        await this.peerConnection.setRemoteDescription(remoteDesc);
        break;
      default:
        this.debug.log('%s: Unknown data received: %s', this.camera, data);
        break;
    }
  }

  /** Publishes the received media track and marks the stream connected. */
  private onTrack(ev: RTCTrackEvent) {
    this.debug.log('%s: Playing new media track.', this.camera);
    this.media.next(ev.streams[0] ?? null);
    this.staleSince = null;
    this.connectedSince = Date.now();
    this.status.next('connected');
  }

  /** Updates the stream status from the latest transport stats. */
  private updateHealthStatus(currentReport: StreamReport) {
    const lastReport = this.streamReport.value;
    const hasPreviousReport = lastReport.timestamp > 0;

    this.streamReport.next(currentReport);
    if (!hasPreviousReport) {
      return;
    }

    // Allow grace period for initial connection establishment
    const gracePeriodMs = 5_000;
    if (!this.connectedSince || Date.now() - this.connectedSince < gracePeriodMs) {
      return;
    }

    const deltaFrames = currentReport.frames - lastReport.frames;
    const deltaBytes = currentReport.bytes - lastReport.bytes;

    // Stream is actively delivering frames and data
    if (deltaFrames > 0 && deltaBytes > 0) {
      this.staleSince = null;
      this.bufferingSince = null;
      this.status.next('streaming');
      return;
    }

    // Bytes are arriving but frames not yet decoded (waiting for keyframe or decoder)
    if (deltaBytes > 0 && deltaFrames === 0) {
      if (this.bufferingSince === null) {
        this.bufferingSince = Date.now();
        this.debug.log('%s: Stream buffering. Bytes: %s', this.camera, deltaBytes);
      }
      this.status.next('buffering');

      // Give buffering 10 seconds to resolve (keyframe arrival, decoder catchup, etc)
      if (Date.now() - this.bufferingSince > 10_000) {
        this.debug.log('%s: Buffering timeout. Reconnecting.', this.camera);
        this.requestReconnect('Buffering timeout');
      }
      return;
    }

    // No data arriving at all - connection is dead
    this.bufferingSince = null;
    if (this.staleSince === null) {
      this.staleSince = Date.now();
      this.debug.log('%s: Stream is dead (no data). Frames: %s, Bytes: %s', this.camera, deltaFrames, deltaBytes);
    }
    this.status.next('dead');

    // Reconnect after 5 seconds of no data
    if (Date.now() - this.staleSince > 5_000) {
      this.requestReconnect('Stream dead');
    }
  }

  /** Sends newly gathered ICE candidates to the signaling socket. */
  private onIceCandidate(event: RTCPeerConnectionIceEvent) {
    if (!event.candidate || this.webSocket.readyState !== WebSocket.OPEN) {
      return;
    }
    const candidate = event.candidate;

    this.debug.log('%s: Got new ICE candidate.', this.camera);
    this.webSocket.send(JSON.stringify({ type: 'webrtc/candidate', value: candidate.toJSON().candidate }));
  }

  /** Periodically checks whether the active stream is still healthy. */
  private async checkHealth() {
    // We do check the health only if we are connected and shall stream
    if (this.shouldSkipHealthCheck()) {
      return;
    }

    try {
      this.healthCheckRunning = true;
      const currentReport = await this.getStreamReport();
      if (this.shouldAbortHealthCheck()) {
        return;
      }

      this.updateHealthStatus(currentReport);
    } catch (error) {
      this.debug.log('%s: Health check failed.', this.camera, error);
      this.requestReconnect('Health check failure');
    } finally {
      this.healthCheckRunning = false;
    }
  }

  /** Returns the current inbound video statistics for the stream. */
  private async getStreamReport(): Promise<StreamReport> {
    if (this.hasOpenConnection()) {
      const peerConnection = this.peerConnection;
      if (!peerConnection) {
        return { bytes: 0, frames: 0, timestamp: Date.now() } as StreamReport;
      }

      const stats = await peerConnection.getStats();
      const videoReport = Array.from(stats.values()).find(
        (report): report is RTCStats & { kind?: string; bytesReceived?: number; framesDecoded?: number } => {
          const inboundReport = report as RTCStats & { kind?: string; bytesReceived?: number; framesDecoded?: number };
          return inboundReport.type === 'inbound-rtp' && inboundReport.kind === 'video';
        },
      );
      if (videoReport) {
        return {
          bytes: videoReport.bytesReceived ?? 0,
          frames: videoReport.framesDecoded ?? 0,
          timestamp: Date.now(),
        } as StreamReport;
      }
    }
    return { bytes: 0, frames: 0, timestamp: Date.now() } as StreamReport;
  }
}
