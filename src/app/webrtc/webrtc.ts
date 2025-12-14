import { Component, ElementRef, input, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { getWebSocketUrl } from '../models/ws';
import { WebSocket } from 'partysocket';

@Component({
  selector: 'app-webrtc',
  templateUrl: './webrtc.html',
})
export class WebRTC implements OnInit, OnDestroy {
  readonly camera = input.required<string>();

  @ViewChild('myVideo')
  myVideo!: ElementRef<HTMLVideoElement>;

  private peerConnection: RTCPeerConnection | null = null;
  private webSocket: WebSocket | null = null;

  async ngOnInit() {
    const webSocket = new WebSocket(getWebSocketUrl('/ws/webrtc?src=' + this.camera()));
    const peerConnection = new RTCPeerConnection();

    peerConnection.addTransceiver('video', { direction: 'recvonly' });
    peerConnection.onicecandidate = (event) => this.onIceCandidate(webSocket, event);
    peerConnection.onicegatheringstatechange = () => this.onIcegatheringStateChange(peerConnection);
    peerConnection.ontrack = (ev) => this.onTrackChange(ev);

    webSocket.binaryType = 'arraybuffer';
    webSocket.onopen = async () => this.onWebSocketOpen(webSocket, peerConnection);
    webSocket.onmessage = (e) => this.onWebSocketMessage(peerConnection, e);

    this.peerConnection = peerConnection;
    this.webSocket = webSocket;
  }

  async onWebSocketOpen(ws: WebSocket, pc: RTCPeerConnection) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({ type: 'webrtc/offer', value: offer.sdp }));
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
        console.log('ERROR: Closing peer connection');
        pc.close();
        break;
    }
  }

  onTrackChange(ev: RTCTrackEvent) {
    this.myVideo.nativeElement.srcObject = ev.streams[0];
  }

  onIceCandidate(ws: WebSocket, event: RTCPeerConnectionIceEvent) {
    const candidate = event.candidate ? event.candidate.toJSON().candidate : '';
    ws.send(JSON.stringify({ type: 'webrtc/candidate', value: candidate }));
    console.log('Got ICE candidate:', candidate);
  }

  onIcegatheringStateChange(pc: RTCPeerConnection) {
    if (pc.iceGatheringState === 'complete') {
      console.log('ICE gathering complete');
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
