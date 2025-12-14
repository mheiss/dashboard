import { HttpClient } from '@angular/common/http';
import { Component, computed, ElementRef, inject, input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { WebSocket } from 'partysocket';
import { getWebSocketUrl } from '../models/ws';

@Component({
  selector: 'app-webrtc',
  templateUrl: './webrtc.html',
})
export class WebRTC implements OnInit, OnDestroy {
  readonly httpClient = inject(HttpClient);
  readonly camera = input.required<string>();

  @ViewChild('myVideo', { static: true })
  myVideo!: ElementRef<HTMLVideoElement>;

  private peerConnection: RTCPeerConnection | null = null;
  private webSocket: WebSocket | null = null;

  poster = computed(() => {
    return '/api/webrtc/frame.jpeg?src=' + this.camera();
  });

  async ngOnInit() {
    const webSocket = new WebSocket(getWebSocketUrl('/ws/webrtc?src=' + this.camera()));
    const peerConnection = new RTCPeerConnection();

    peerConnection.addTransceiver('video', { direction: 'recvonly' });
    peerConnection.onicecandidate = (event) => this.onIceCandidate(webSocket, event);
    peerConnection.onicegatheringstatechange = () => this.onIcegatheringStateChange(peerConnection);
    peerConnection.ontrack = (ev) => this.onTrack(ev);

    webSocket.binaryType = 'arraybuffer';
    webSocket.onopen = async () => this.onWebSocketOpen(webSocket, peerConnection);
    webSocket.onmessage = (e) => this.onWebSocketMessage(peerConnection, e);
    webSocket.onerror = (e) => this.onWebSocketError(e);

    this.peerConnection = peerConnection;
    this.webSocket = webSocket;
  }

  async onWebSocketOpen(ws: WebSocket, pc: RTCPeerConnection) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({ type: 'webrtc/offer', value: offer.sdp }));
    console.log('%s: Starting a new WebRTC connection.', this.camera());
  }

  async onWebSocketError(e: any) {
    console.log('%s: Failed to create WebSocket connection.', this.camera(), e);
  }

  async onWebSocketMessage(pc: RTCPeerConnection, msg: any) {
    const data = JSON.parse(msg.data);
    switch (data.type) {
      case 'webrtc/candidate':
        const candidate = new RTCIceCandidate({ candidate: data.value, sdpMid: '0' });
        pc.addIceCandidate(candidate);
        break;
      case 'webrtc/answer':
        const remoteDesc = { type: 'answer', sdp: data.value } as RTCSessionDescriptionInit;
        pc.setRemoteDescription(remoteDesc);
        break;
      case 'error':
        console.log('%s: Closing peer connection due to error event.', this.camera());
        pc.close();
        break;
    }
  }

  onTrack(ev: RTCTrackEvent) {
    this.myVideo.nativeElement.srcObject = ev.streams[0];
    this.myVideo.nativeElement.muted = true;
    this.myVideo.nativeElement.play();
    console.log('%s: Got a new track, playing it.', this.camera());
  }

  onIceCandidate(ws: WebSocket, event: RTCPeerConnectionIceEvent) {
    // End of candidates, no need to send it back
    if (!event.candidate) {
      return;
    }
    const candidate = event.candidate ? event.candidate.toJSON().candidate : '';
    ws.send(JSON.stringify({ type: 'webrtc/candidate', value: candidate }));
    console.log('%s: Got new ICE candidate. Protocol: %s, Type: %s ', this.camera(), event.candidate.protocol, event.candidate.type);
  }

  onIcegatheringStateChange(pc: RTCPeerConnection) {
    if (pc.iceGatheringState === 'complete') {
      console.log('%s: ICE gathering complete', this.camera());
    }
  }

  ngOnDestroy(): void {
    if (this.peerConnection) {
      this.peerConnection.close();
    }
    if (this.webSocket) {
      this.webSocket.close();
    }
  }
}
