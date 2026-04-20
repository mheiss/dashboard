import { HttpClient } from '@angular/common/http';
import { WebSocket } from 'partysocket';
import { BehaviorSubject, interval, Observable } from 'rxjs';
import { DebugService } from '../../utils/debug.service';
import { getWebSocketUrl } from '../../utils/webSocket';

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

  constructor(
    private httpClient: HttpClient,
    private camera: string,
    private debug: DebugService,
  ) {
    this.webSocket = new WebSocket(getWebSocketUrl('/ws/webrtc?src=' + camera));
    this.webSocket.onopen = async () => this.onWebSocketOpen();
    this.webSocket.onclose = async () => this.onWebSocketClose();
    this.webSocket.onmessage = (e) => this.onWebSocketMessage(e);
    this.webSocket.onerror = (e) => this.onWebSocketError(e);
    this.webSocket.binaryType = 'arraybuffer';

    interval(1000).subscribe(() => this.checkHealth());
  }

  start(): StreamOffer {
    // Disable any stop attempts
    clearTimeout(this.stopTimer);
    this.stopTimer = undefined;

    // establish connection if we do not have a connection
    this.updatePoster();
    this.shallStream = true;
    if (
      this.webSocket.readyState !== WebSocket.OPEN &&
      this.webSocket.readyState !== WebSocket.CONNECTING &&
      !this.reconnectPending
    ) {
      this.requestReconnect('start requested');
    }

    return {
      media: this.media.asObservable(),
      status: this.status.asObservable(),
      poster: this.poster.asObservable(),
      report: this.streamReport.asObservable(),
    };
  }

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

  private createEmptyReport(): StreamReport {
    return { bytes: 0, frames: 0, timestamp: 0 };
  }

  private resetHealthState() {
    this.staleSince = null;
    this.streamReport.next(this.createEmptyReport());
  }

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

  private updatePoster() {
    this.httpClient.get(`/api/webrtc/frame.jpeg?src=${this.camera}`, { responseType: 'blob' }).subscribe((blob) => {
      const oldValue = this.poster.getValue();
      this.poster.next(URL.createObjectURL(blob));
      if (oldValue) {
        URL.revokeObjectURL(oldValue);
      }
    });
  }

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

  private async onWebSocketClose() {
    this.debug.log('%s: Socket closed.', this.camera);

    this.cleanupPeerConnection();
    this.media.next(null);
    this.resetHealthState();
    this.status.next('offline');

    if (this.shallStream) {
      this.reconnectPending = false;
      this.requestReconnect('socket closed');
      return;
    }

    this.reconnectPending = false;
    this.debug.log('%s: Closed WebRTC connection and stopped streaming.', this.camera);
  }

  private async onWebSocketError(e: any) {
    this.debug.log('%s: Unexpected error.', this.camera, e);
  }

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

  private onTrack(ev: RTCTrackEvent) {
    this.debug.log('%s: Playing new media track.', this.camera);
    this.media.next(ev.streams[0] ?? null);
    this.staleSince = null;
    this.status.next('connected');
  }

  private onIceCandidate(event: RTCPeerConnectionIceEvent) {
    if (!event.candidate || this.webSocket.readyState !== WebSocket.OPEN) {
      return;
    }
    const candidate = event.candidate;

    this.debug.log('%s: Got new ICE candidate. Type: %s, Protocol: %s', this.camera, candidate.type, candidate.protocol);
    this.webSocket.send(JSON.stringify({ type: 'webrtc/candidate', value: candidate.toJSON().candidate }));
  }

  private async checkHealth() {
    // We do check the health only if we are connected and shall stream
    if (
      this.healthCheckRunning ||
      this.reconnectPending ||
      !this.shallStream ||
      this.webSocket.readyState !== WebSocket.OPEN ||
      !this.peerConnection
    ) {
      return;
    }

    this.healthCheckRunning = true;

    try {
      const currentReport = await this.getStreamReport();
      if (
        this.reconnectPending ||
        !this.shallStream ||
        this.webSocket.readyState !== WebSocket.OPEN ||
        !this.peerConnection
      ) {
        return;
      }

      const lastReport = this.streamReport.value;
      const hasPreviousReport = lastReport.timestamp > 0;

      this.streamReport.next(currentReport);
      if (!hasPreviousReport) {
        return;
      }

      // Check if the stream sends data
      const deltaFrames = currentReport.frames - lastReport.frames;
      const deltaBytes = currentReport.bytes - lastReport.bytes;
      if (deltaFrames > 0 && deltaBytes > 0) {
        this.staleSince = null;
        this.status.next('streaming');
        return;
      }

      if (this.staleSince === null) {
        this.staleSince = Date.now();
      }
      this.status.next('stale');

      if (Date.now() - this.staleSince > 5_000) {
        this.requestReconnect('stale stream');
      }
    } catch (error) {
      this.debug.log('%s: Health check failed.', this.camera, error);
      this.requestReconnect('health check failure');
    } finally {
      this.healthCheckRunning = false;
    }
  }

  /**
   * Returns a report of the video stream.
   */
  private async getStreamReport(): Promise<StreamReport> {
    const wsAlive = this.webSocket.readyState === WebSocket.OPEN;
    if (wsAlive && this.peerConnection) {
      const stats = await this.peerConnection.getStats();
      const reports = Array.from(stats.values());
      const videoReports = reports.filter((r) => r.type === 'inbound-rtp' && r.kind === 'video');
      if (videoReports && videoReports.length > 0) {
        const videoReport = videoReports[0];
        const frames = videoReport.framesDecoded;
        const bytes = videoReport.bytesReceived;
        const timestamp = Date.now();
        return { bytes: bytes, frames: frames, timestamp: timestamp } as StreamReport;
      }
    }
    return { bytes: 0, frames: 0, timestamp: Date.now() } as StreamReport;
  }
}
