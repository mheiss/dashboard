import { HttpClient } from '@angular/common/http';
import { WebSocket } from 'partysocket';
import { BehaviorSubject, interval, Observable, Subject, takeUntil } from 'rxjs';
import { getWebSocketUrl } from '../utils/webSocket';

/**
 * Health status of the stream.
 */
export type Status = 'offline' | 'connecting' | 'streaming' | 'stale';

/**
 * The video stream along with some metadata.
 */
export interface StreamOffer {
  media: Observable<MediaStream | null>;
  poster: Observable<string | null>;
  health: Observable<Status>;
  stats: Observable<StreamReport>;
}

/**
 * Status report of a stream.
 */
export interface StreamReport {
  framesDecoded: number;
  bytesReceived: number;
  checkTime: number;
}

export class WebRTCStream {
  private readonly webSocket: WebSocket;
  private peerConnection: RTCPeerConnection | null = null;

  private readonly media = new BehaviorSubject<MediaStream | null>(null);
  private readonly poster = new BehaviorSubject<string | null>(null);
  private readonly health = new BehaviorSubject<Status>('offline');
  private readonly stats = new BehaviorSubject<StreamReport>({} as StreamReport);

  private streamReport: StreamReport = {} as StreamReport;
  private streamMonitor = new Subject<Boolean>();

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
  }

  createOrResume(): StreamOffer {
    this.updatePoster();
    this.resumeStream();
    return {
      media: this.media.asObservable(),
      health: this.health.asObservable(),
      poster: this.poster.asObservable(),
      stats: this.stats.asObservable(),
    };
  }

  stop() {
    this.webSocket.close();
  }

  private resumeStream() {
    this.webSocket.reconnect();
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
    this.health.next('connecting');

    this.peerConnection = new RTCPeerConnection({
      iceServers: [], // LAN/VPN only, no public STUN/TURN
    });
    this.peerConnection.addTransceiver('video', { direction: 'recvonly' });
    this.peerConnection.onicecandidate = (event) => this.onIceCandidate(event);
    this.peerConnection.ontrack = (ev) => this.onTrack(ev);

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    console.log('%s: Starting a new WebRTC connection.', this.camera);
    this.webSocket.send(JSON.stringify({ type: 'webrtc/offer', value: offer.sdp }));
  }

  private async onWebSocketClose() {
    this.health.next('offline');
    if (this.peerConnection) {
      console.log('%s: Closing WebRTC Connection', this.camera);
      this.peerConnection.getSenders().forEach((sender) => {
        if (sender.track) {
          sender.track.stop();
        }
      });
      this.peerConnection.close();
      this.peerConnection = null;
    }
  }

  private async onWebSocketError(e: any) {
    console.log('%s: Unexpected error.', this.camera, e);
    this.webSocket.reconnect();
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
    }
  }

  private onTrack(ev: RTCTrackEvent) {
    console.log('%s: Playing new media track.', this.camera);

    const stream = ev.streams[0];
    this.media.next(stream);
    this.startStreamMonitor();
  }

  private onIceCandidate(event: RTCPeerConnectionIceEvent) {
    if (!event.candidate) {
      return;
    }
    const candidate = event.candidate;

    console.log('%s: Got new ICE candidate. Type: %s, Protocol: %s', this.camera, candidate.type, candidate.protocol);
    this.webSocket.send(JSON.stringify({ type: 'webrtc/candidate', value: candidate.toJSON().candidate }));
  }

  private async startStreamMonitor() {
    this.streamMonitor.next(false);
    this.streamReport = { framesDecoded: 0, bytesReceived: 0, checkTime: Date.now() };
    interval(1000)
      .pipe(takeUntil(this.streamMonitor))
      .subscribe(() => this.checkIsStreaming());
  }

  private async checkIsStreaming() {
    const streamReport = await this.getStreamReport();
    if (!streamReport) {
      return;
    }
    this.stats.next(streamReport);

    // Mark as stale if no frames/bytes are received
    const elapsed = streamReport.checkTime - this.streamReport.checkTime;
    const deltaFrames = streamReport.framesDecoded - this.streamReport.framesDecoded;
    const deltaBytes = streamReport.bytesReceived - this.streamReport.bytesReceived;
    if (elapsed > 2000 && (deltaFrames === 0 || deltaBytes === 0)) {
      this.health.next('stale');
      return;
    }
    this.health.next('streaming');
  }

  /**
   * Returns a report of the video stream.
   */
  private async getStreamReport(): Promise<StreamReport | null> {
    const wsAlive = this.webSocket.readyState === WebSocket.OPEN;
    if (!wsAlive || !this.peerConnection) {
      return null;
    }
    const stats = await this.peerConnection.getStats();
    const reports = Array.from(stats.values());
    const videoReports = reports.filter((r) => r.type === 'inbound-rtp' && r.kind === 'video');
    if (!videoReports || videoReports.length == 0) {
      return null;
    }
    const videoReport = videoReports[0];
    const framesDecoded = videoReport.framesDecoded;
    const bytesReceived = videoReport.bytesReceived;
    const checkTime = Date.now();
    return { framesDecoded, bytesReceived, checkTime } as StreamReport;
  }
}
