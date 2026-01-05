import { HttpClient } from '@angular/common/http';
import { WebSocket } from 'partysocket';
import { BehaviorSubject, interval, Observable, pipe, Subject, takeUntil, timer } from 'rxjs';
import { getWebSocketUrl } from '../../utils/webSocket';
import { unescapeLeadingUnderscores } from 'typescript';

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
  private readonly streamReport = new BehaviorSubject<StreamReport>({} as StreamReport);

  private stopTimer: number | undefined = undefined;
  private shallStream = false;

  constructor(
    private httpClient: HttpClient,
    private camera: string,
  ) {
    this.webSocket = new WebSocket(getWebSocketUrl('/ws/webrtc?src=' + camera));
    this.webSocket.onopen = async (e) => this.onWebSocketOpen();
    this.webSocket.onclose = async (e) => this.onWebSocketClose();
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
    if (this.webSocket.readyState != WebSocket.OPEN || !this.peerConnection) {
      this.webSocket.reconnect();
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
      this.webSocket.close();
    }, 30_000);
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
    this.status.next('connecting');

    // Peer connection with LAN/VPN only, no public STUN/TURN
    this.peerConnection = new RTCPeerConnection({ iceServers: [] });
    this.peerConnection.addTransceiver('video', { direction: 'recvonly' });
    this.peerConnection.onicecandidate = (event) => this.onIceCandidate(event);
    this.peerConnection.ontrack = (ev) => this.onTrack(ev);

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    console.log('%s: Starting a new WebRTC connection.', this.camera);
    this.webSocket.send(JSON.stringify({ type: 'webrtc/offer', value: offer.sdp }));
  }

  private async onWebSocketClose() {
    console.log('%s: Socket closed.', this.camera);
    if (this.peerConnection) {
      this.peerConnection.getSenders().forEach((sender) => {
        this.peerConnection?.removeTrack(sender);
        if (sender.track) {
          sender.track.stop();
        }
      });
      this.peerConnection.close();
      this.peerConnection = null;
      console.log('%s: Closed WebRTC connection and stopped streaming.', this.camera);
    }
    this.status.next('offline');
  }

  private async onWebSocketError(e: any) {
    console.log('%s: Unexpected error.', this.camera, e);
  }

  private async onWebSocketMessage(msg: any) {
    if (!this.peerConnection) {
      throw new Error('Invalid WebRTC connection');
    }
    const data = JSON.parse(msg.data);
    switch (data.type) {
      case 'webrtc/candidate':
        const candidate = new RTCIceCandidate({ candidate: data.value, sdpMid: '0' });
        this.peerConnection?.addIceCandidate(candidate);
        break;
      case 'webrtc/answer':
        const remoteDesc = { type: 'answer', sdp: data.value } as RTCSessionDescriptionInit;
        this.peerConnection?.setRemoteDescription(remoteDesc);
        break;
      default:
        console.log('%s: Unknown data received: %s', this.camera, data);
        break;
    }
  }

  private onTrack(ev: RTCTrackEvent) {
    console.log('%s: Playing new media track.', this.camera);
    this.media.next(ev.streams[0]);
    this.status.next('connected');
  }

  private onIceCandidate(event: RTCPeerConnectionIceEvent) {
    if (!event.candidate) {
      return;
    }
    const candidate = event.candidate;

    console.log('%s: Got new ICE candidate. Type: %s, Protocol: %s', this.camera, candidate.type, candidate.protocol);
    this.webSocket.send(JSON.stringify({ type: 'webrtc/candidate', value: candidate.toJSON().candidate }));
  }

  private async checkHealth() {
    // We do check the health only if we are connected and shall stream
    if (!this.shallStream || this.webSocket.readyState !== WebSocket.OPEN) {
      return;
    }

    const currentReport = await this.getStreamReport();
    const lastReport = this.streamReport.value;

    // Check if the stream sends data
    const deltaFrames = currentReport.frames - lastReport.frames;
    const deltaBytes = currentReport.bytes - lastReport.bytes;
    if (deltaFrames === 0 || deltaBytes === 0) {
      this.status.next('stale');

      // Restart the stream if stale for more than 5 seconds
      const elapsed = Date.now() - lastReport.timestamp;
      if (elapsed > 5_000) {
        console.log('Stale stream detected. Restarting socket.');
        this.webSocket.close();
        this.webSocket.reconnect();
        return;
      }
    }

    // Stream is healthy
    this.streamReport.next(currentReport);
    this.status.next('streaming');
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
