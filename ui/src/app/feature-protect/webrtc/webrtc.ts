import { CameraService } from '../../backend/generated/services/camera.service';
import { WebSocket } from 'partysocket';
import { BehaviorSubject, interval } from 'rxjs';
import { DebugService } from '../../utils/debug.service';
import { getWebSocketUrl } from '../../utils/webSocket';
import { createEmptyReport, createStreamReport, Status, StreamOffer, StreamReport } from './webrtc.model';

/**
 * Time that the stream can be buffering.
 */
const BUFFER_TIMEOUT = 10_000;

/**
 * Time that the stream can be frozen until considered dead and reconnected.
 */
const STALE_TIMEOUT = 5_000;

const STARTUP_TIMEOUT = 30_000;
const HEALTH_STALL_GRACE = 2_000;

export class WebRTCStream {
  private readonly webSocket: WebSocket;
  private peerConnection: RTCPeerConnection | null = null;

  private readonly media = new BehaviorSubject<MediaStream | null>(null);
  private readonly poster = new BehaviorSubject<string | null>(null);
  private readonly status = new BehaviorSubject<Status>('offline');
  private readonly streamReport = new BehaviorSubject<StreamReport>(createEmptyReport());

  private stopTimer: number | undefined = undefined;
  private shallStream = false;
  private reconnectPending = false;
  private healthCheckPeer: RTCPeerConnection | null = null;
  private staleSince: number | null = null;
  private bufferingSince: number | null = null;
  private hasDecodedFrame = false;
  private lastWebSocketError: string | null = null;
  private startedAt: number | null = null;
  private disconnectedSince: number | null = null;
  private previousVideoReport: RTCInboundRtpStreamStats | null = null;
  private reconnectReason: string | null = null;
  private lastDiagnosticAt = 0;

  constructor(
    private cameraApi: CameraService,
    private camera: string,
    private debug: DebugService,
  ) {
    this.webSocket = new WebSocket(getWebSocketUrl('/api/ws/webrtc?src=' + encodeURIComponent(camera)), [], { startClosed: true });
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
      this.cleanupPeerConnection();
      this.markStreamOffline();
      this.webSocket.close();
    }, 30_000);
  }

  /** Checks whether a peer connection exists independently of signaling. */
  private hasOpenConnection(): boolean {
    return this.peerConnection !== null && this.peerConnection.connectionState !== 'closed';
  }

  /** Decides whether start should trigger a reconnect attempt. */
  private shouldReconnectOnStart(): boolean {
    return (
      !this.hasOpenConnection() &&
      this.webSocket.readyState !== WebSocket.OPEN &&
      this.webSocket.readyState !== WebSocket.CONNECTING &&
      !this.reconnectPending
    );
  }

  /** Returns whether the current health-check cycle should be skipped. */
  private shouldSkipHealthCheck(): boolean {
    return (
      (this.healthCheckPeer !== null && this.healthCheckPeer === this.peerConnection) ||
      this.reconnectPending ||
      !this.shallStream ||
      !this.hasOpenConnection()
    );
  }

  /** Returns whether an in-flight health-check result should be ignored. */
  private shouldAbortHealthCheck(): boolean {
    return this.reconnectPending || !this.shallStream || !this.hasOpenConnection();
  }

  /** Clears stale tracking and resets the current stream report. */
  private resetHealthState() {
    this.staleSince = null;
    this.bufferingSince = null;
    this.hasDecodedFrame = false;
    this.startedAt = null;
    this.disconnectedSince = null;
    this.previousVideoReport = null;
    this.lastDiagnosticAt = 0;
    this.streamReport.next({ ...createEmptyReport(), reconnectReason: this.reconnectReason });
  }

  /** Stops and disposes the current peer connection if present. */
  private cleanupPeerConnection() {
    if (!this.peerConnection) {
      return;
    }

    const peerConnection = this.peerConnection;
    this.peerConnection = null;
    peerConnection.onconnectionstatechange = null;
    peerConnection.oniceconnectionstatechange = null;
    peerConnection.onicecandidate = null;
    peerConnection.ontrack = null;
    peerConnection.getSenders().forEach((sender) => {
      sender.track?.stop();
    });
    peerConnection.getReceivers().forEach((receiver) => receiver.track?.stop());
    peerConnection.close();
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
    this.reconnectReason = reason;
    this.logDiagnostics('Reconnect: ' + reason);
    this.cleanupPeerConnection();
    this.media.next(null);
    this.resetHealthState();
    this.status.next('connecting');
    this.debug.log('%s: Reconnecting WebRTC stream (%s).', this.camera, reason);

    this.webSocket.reconnect(1000, reason);
  }

  /** Fetches and updates the latest poster image for the camera. */
  private updatePoster() {
    void this.cameraApi
      .getCameraFrame({ src: this.camera })
      .then((blob) => {
        const oldValue = this.poster.getValue();
        this.poster.next(URL.createObjectURL(blob));
        if (oldValue) {
          URL.revokeObjectURL(oldValue);
        }
      })
      .catch((error) => this.debug.log('%s: Camera poster request failed. %s', this.camera, error));
  }

  /** Creates a fresh peer connection when the signaling socket opens. */
  private async onWebSocketOpen() {
    if (!this.shallStream) {
      this.webSocket.close();
      return;
    }

    if (this.peerConnection?.connectionState === 'connected' && !this.reconnectPending) {
      this.webSocket.close(1000, 'WebRTC media established');
      return;
    }

    this.lastWebSocketError = null;
    this.reconnectPending = false;
    this.resetHealthState();
    this.startedAt = Date.now();
    this.status.next('connecting');

    // Peer connection with LAN/VPN only, no public STUN/TURN
    this.cleanupPeerConnection();
    const peerConnection = new RTCPeerConnection({ iceServers: [] });
    this.peerConnection = peerConnection;
    peerConnection.onconnectionstatechange = () => this.onConnectionStateChange(peerConnection);
    peerConnection.oniceconnectionstatechange = () => this.onConnectionStateChange(peerConnection);
    peerConnection.onicecandidate = (event) => {
      if (this.peerConnection === peerConnection) this.onIceCandidate(event);
    };
    peerConnection.ontrack = (event) => {
      if (this.peerConnection === peerConnection) this.onTrack(event);
    };

    try {
      peerConnection.addTransceiver('video', { direction: 'recvonly' });
      const offer = await peerConnection.createOffer();
      if (this.peerConnection !== peerConnection) return;
      await peerConnection.setLocalDescription(offer);
      if (this.peerConnection !== peerConnection || this.webSocket.readyState !== WebSocket.OPEN) return;

      const sdp = peerConnection.localDescription?.sdp;
      if (sdp) {
        this.webSocket.send(JSON.stringify({ type: 'webrtc/offer', value: sdp }));
      }
      this.debug.log('%s: Starting a new WebRTC connection.', this.camera);
    } catch (error) {
      if (this.peerConnection !== peerConnection) return;
      this.debug.log('%s: WebRTC offer failed. %s', this.camera, error);
      this.requestReconnect('Offer failed');
    }
  }

  /** Cleans up the current connection and reconnects when required. */
  private async onWebSocketClose(e: CloseEvent) {
    const socketError = this.lastWebSocketError;
    this.lastWebSocketError = null;

    if (this.reconnectPending) {
      this.debug.log('%s: Socket closed for reconnect. %s', this.camera, this.describeWebSocketClose(e));
      return;
    }

    if (this.shallStream && this.peerConnection?.connectionState === 'connected') {
      this.webSocket.close();
      this.debug.log('%s: Signaling closed; keeping WebRTC media. %s', this.camera, this.describeWebSocketClose(e));
      return;
    }

    if (this.shallStream) {
      const errorDetail = socketError && (!e.wasClean || e.code !== 1000) ? ` Previous error: ${socketError}` : '';
      this.debug.log('%s: Socket closed. %s%s', this.camera, this.describeWebSocketClose(e), errorDetail);
      this.requestReconnect('Socket closed');
      return;
    }

    this.reconnectPending = false;
    this.debug.log('%s: Closed WebRTC connection and stopped streaming.', this.camera);
  }

  private onConnectionStateChange(peerConnection: RTCPeerConnection) {
    if (this.peerConnection !== peerConnection || !this.shallStream || this.reconnectPending) return;
    this.debug.log('%s: Peer state=%s, ICE state=%s.', this.camera, peerConnection.connectionState, peerConnection.iceConnectionState);
    if (peerConnection.connectionState === 'failed' || peerConnection.iceConnectionState === 'failed') {
      this.requestReconnect('Peer connection failed');
    } else if (peerConnection.connectionState === 'disconnected' || peerConnection.iceConnectionState === 'disconnected') {
      this.disconnectedSince ??= Date.now();
    } else {
      this.disconnectedSince = null;
    }
  }

  /** Logs unexpected signaling socket errors. */
  private async onWebSocketError(event: Event) {
    this.lastWebSocketError = this.describeWebSocketError(event);
    this.debug.log('%s: WebSocket error event. %s', this.camera, this.lastWebSocketError);
  }

  /** Builds a readable description from browser WebSocket close events. */
  private describeWebSocketClose(event: CloseEvent): string {
    return `Close code=${event.code}, reason=${event.reason || '<none>'}, wasClean=${event.wasClean}.`;
  }

  /** Builds a readable error description from browser WebSocket error events. */
  private describeWebSocketError(event: Event): string {
    if (event instanceof ErrorEvent) {
      return [event.message, event.error?.message, event.filename].filter(Boolean).join(' | ') || event.type;
    }
    return `Browser did not expose a cause. Event type=${event.type}, readyState=${this.webSocket.readyState}, url=${this.webSocket.url}.`;
  }

  /** Applies incoming signaling messages to the peer connection. */
  private async onWebSocketMessage(msg: MessageEvent) {
    const peerConnection = this.peerConnection;
    if (!peerConnection || this.reconnectPending) {
      this.debug.log('%s: Ignoring signaling message without peer connection.', this.camera);
      return;
    }
    try {
      const data = JSON.parse(msg.data);
      switch (data.type) {
        case 'webrtc/candidate':
          await peerConnection.addIceCandidate({ candidate: data.value, sdpMid: '0' });
          break;
        case 'webrtc/answer':
          await peerConnection.setRemoteDescription({ type: 'answer', sdp: data.value });
          break;
        case 'error':
          this.debug.log('%s: Signaling error: %s', this.camera, data.value);
          this.requestReconnect('Signaling error');
          break;
        default:
          this.debug.log('%s: Unknown data received: %s', this.camera, JSON.stringify(data));
          break;
      }
    } catch (error) {
      if (this.peerConnection !== peerConnection) return;
      this.debug.log('%s: Signaling message failed. %s', this.camera, error);
      this.requestReconnect('Signaling message failed');
    }
  }

  /** Publishes the received media track and marks the stream connected. */
  private onTrack(ev: RTCTrackEvent) {
    this.debug.log('%s: Received new media track.', this.camera);
    this.media.next(ev.streams[0] ?? new MediaStream([ev.track]));
    this.staleSince = null;
    this.status.next('connected');
  }

  /** Updates the stream status from the latest transport stats. */
  private updateHealthStatus(currentReport: StreamReport) {
    const lastReport = this.streamReport.value;
    const now = Date.now();

    if (currentReport.frames > 0) {
      this.hasDecodedFrame = true;
    }

    this.streamReport.next(currentReport);

    const deltaFrames = currentReport.frames - lastReport.frames;
    const deltaBytes = currentReport.bytes - lastReport.bytes;

    // Stream is actively delivering frames and data
    if (deltaFrames > 0) {
      if (this.staleSince || this.bufferingSince) {
        this.debug.log('%s: Streaming.', this.camera);
      }
      this.staleSince = null;
      this.bufferingSince = null;
      this.status.next('streaming');
      return;
    }

    if (!this.hasDecodedFrame) {
      this.status.next('startup');
      return;
    }

    this.bufferingSince ??= now;
    if (deltaBytes > 0) {
      this.staleSince = null;
      if (now - this.bufferingSince >= HEALTH_STALL_GRACE) {
        this.status.next('buffering');
      }
      if (now - this.bufferingSince > BUFFER_TIMEOUT) {
        this.requestReconnect('Buffering timeout');
      }
      return;
    }

    this.staleSince ??= now;
    if (now - this.staleSince >= HEALTH_STALL_GRACE) {
      this.status.next('dead');
    }
    if (now - this.staleSince > STALE_TIMEOUT) {
      this.requestReconnect('Stream dead');
    }
  }

  /** Sends newly gathered ICE candidates to the signaling socket. */
  private onIceCandidate(event: RTCPeerConnectionIceEvent) {
    if (this.webSocket.readyState !== WebSocket.OPEN) {
      return;
    }
    const candidate = event.candidate?.toJSON().candidate ?? '';

    this.debug.log('%s: Got new ICE candidate.', this.camera);
    this.webSocket.send(JSON.stringify({ type: 'webrtc/candidate', value: candidate }));
  }

  /** Periodically checks whether the active stream is still healthy. */
  private async checkHealth() {
    // We do check the health only if we are connected and shall stream
    if (this.shouldSkipHealthCheck()) {
      return;
    }

    const peerConnection = this.peerConnection;
    if (!peerConnection) return;
    try {
      this.healthCheckPeer = peerConnection;
      const currentReport = await this.getStreamReport(peerConnection);
      if (this.peerConnection !== peerConnection || this.shouldAbortHealthCheck()) {
        return;
      }

      this.updateHealthStatus(currentReport);
      if (this.reconnectPending) return;

      const now = Date.now();
      if (this.disconnectedSince !== null && now - this.disconnectedSince > STALE_TIMEOUT) {
        this.requestReconnect('Peer disconnected');
      } else if (!this.hasDecodedFrame && this.startedAt !== null && now - this.startedAt > STARTUP_TIMEOUT) {
        this.requestReconnect('Startup timeout');
      } else if (this.hasDecodedFrame && peerConnection.connectionState === 'connected' && this.webSocket.readyState === WebSocket.OPEN) {
        this.webSocket.close(1000, 'WebRTC media established');
      }

      if (!this.reconnectPending && now - this.lastDiagnosticAt >= 10_000) {
        this.lastDiagnosticAt = now;
        this.logDiagnostics('Health');
      }
    } catch (error) {
      if (this.peerConnection !== peerConnection || !this.shallStream) return;
      this.debug.log('%s: Health check failed. %s', this.camera, error);
      this.requestReconnect('Health check failure');
    } finally {
      if (this.healthCheckPeer === peerConnection) {
        this.healthCheckPeer = null;
      }
    }
  }

  /** Returns the current inbound video statistics for the stream. */
  private async getStreamReport(peerConnection: RTCPeerConnection): Promise<StreamReport> {
    const stats = await peerConnection.getStats();
    const videoReport = Array.from(stats.values()).find(
      (report): report is RTCInboundRtpStreamStats => report.type === 'inbound-rtp' && report.kind === 'video',
    );

    const transport = videoReport?.transportId ? stats.get(videoReport.transportId) : undefined;
    const pair = transport?.selectedCandidatePairId ? stats.get(transport.selectedCandidatePairId) : undefined;
    const localCandidate = pair?.localCandidateId ? stats.get(pair.localCandidateId) : undefined;
    const remoteCandidate = pair?.remoteCandidateId ? stats.get(pair.remoteCandidateId) : undefined;
    const diagnostics: Partial<StreamReport> = {
      connectionState: peerConnection.connectionState,
      iceConnectionState: peerConnection.iceConnectionState,
      reconnectReason: this.reconnectReason,
      roundTripTimeMs: pair?.currentRoundTripTime != null ? pair.currentRoundTripTime * 1000 : null,
      transport: localCandidate
        ? [localCandidate.protocol, localCandidate.candidateType, remoteCandidate?.candidateType, localCandidate.relayProtocol]
            .filter(Boolean)
            .join('/')
        : null,
    };

    if (!videoReport) {
      return createStreamReport(this.streamReport.value.frames, this.streamReport.value.bytes, diagnostics);
    }

    const previous = this.previousVideoReport?.id === videoReport.id ? this.previousVideoReport : null;
    const seconds = previous ? (videoReport.timestamp - previous.timestamp) / 1000 : 0;
    const deltaFrames = previous ? (videoReport.framesDecoded ?? 0) - (previous.framesDecoded ?? 0) : 0;
    const deltaBytes = previous ? (videoReport.bytesReceived ?? 0) - (previous.bytesReceived ?? 0) : 0;
    const deltaEmitted = previous ? (videoReport.jitterBufferEmittedCount ?? 0) - (previous.jitterBufferEmittedCount ?? 0) : 0;
    if (this.peerConnection === peerConnection) {
      this.previousVideoReport = videoReport;
    }

    return createStreamReport(videoReport.framesDecoded ?? 0, videoReport.bytesReceived ?? 0, {
      ...diagnostics,
      fps: seconds > 0 && deltaFrames >= 0 ? deltaFrames / seconds : null,
      bitrate: seconds > 0 && deltaBytes >= 0 ? (deltaBytes * 8) / seconds : null,
      packetsLost: videoReport.packetsLost ?? null,
      packetsReceived: videoReport.packetsReceived ?? null,
      framesDropped: videoReport.framesDropped ?? null,
      jitterMs: videoReport.jitter != null ? videoReport.jitter * 1000 : null,
      decodeTimeMs:
        previous?.totalDecodeTime != null && videoReport.totalDecodeTime != null && deltaFrames > 0
          ? ((videoReport.totalDecodeTime - previous.totalDecodeTime) * 1000) / deltaFrames
          : null,
      jitterBufferDelayMs:
        previous?.jitterBufferDelay != null && videoReport.jitterBufferDelay != null && deltaEmitted > 0
          ? ((videoReport.jitterBufferDelay - previous.jitterBufferDelay) * 1000) / deltaEmitted
          : null,
      pliCount: videoReport.pliCount ?? null,
      nackCount: videoReport.nackCount ?? null,
    });
  }

  private logDiagnostics(reason: string) {
    this.debug.log(
      '%s: %s %s',
      this.camera,
      reason,
      JSON.stringify({
        ...this.streamReport.value,
        status: this.status.value,
        connectionState: this.peerConnection?.connectionState ?? null,
        iceConnectionState: this.peerConnection?.iceConnectionState ?? null,
        reconnectReason: this.reconnectReason,
      }),
    );
  }
}
