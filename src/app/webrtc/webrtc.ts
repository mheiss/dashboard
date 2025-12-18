import { HttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { WebSocket } from 'partysocket';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { getWebSocketUrl } from '../models/webSocket';

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
    if (!this.peerConnection) {
      return;
    }
    console.log('%s: Closing WebRTC Connection', this.camera);
    this.peerConnection.getSenders().forEach((sender) => {
      if (sender.track) {
        sender.track.stop();
      }
    });
    this.peerConnection.close();
    this.peerConnection = null;
  }

  private async onWebSocketError(e: any) {
    console.log('%s: Failed to create WebSocket.', this.camera, e);
  }

  private async onWebSocketMessage(msg: any) {
    if (!this.peerConnection) {
      throw new Error('Invalid WebRTC connection');
    }
    const data = JSON.parse(msg.data);
    switch (data.type) {
      case 'webrtc/candidate':
        const candidate = new RTCIceCandidate({ candidate: data.value, sdpMid: '0' });
        this.peerConnection.addIceCandidate(candidate);
        break;
      case 'webrtc/answer':
        const remoteDesc = { type: 'answer', sdp: data.value } as RTCSessionDescriptionInit;
        this.peerConnection.setRemoteDescription(remoteDesc);
        break;
    }
  }

  private onTrack(ev: RTCTrackEvent) {
    console.log('%s: Got a new track.', this.camera);
    this.media.next(ev.streams[0]);
  }

  private onIceCandidate(event: RTCPeerConnectionIceEvent) {
    if (!event.candidate) {
      return;
    }
    const candidate = event.candidate;

    console.log('%s: Got new ICE candidate. Type: %s, Protocol: %s', this.camera, candidate.type, candidate.protocol);
    this.webSocket.send(JSON.stringify({ type: 'webrtc/candidate', value: candidate.toJSON().candidate }));
  }
}
