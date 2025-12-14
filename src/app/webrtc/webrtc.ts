import { Component, ElementRef, input, Input, OnInit, ViewChild } from '@angular/core';
import { getWebSocketUrl } from '../models/ws';

@Component({
  selector: 'app-webrtc',
  imports: [],
  templateUrl: './webrtc.html',
})
export class WebRTC implements OnInit {
  readonly camera = input.required<string>();

  @ViewChild('myVideo')
  myVideo!: ElementRef<HTMLVideoElement>;

  async ngOnInit() {
    const peerConnection = new RTCPeerConnection();
    peerConnection.addTransceiver('video', { direction: 'recvonly' });

    peerConnection.onicecandidate = (event) => {
      const candidate = event.candidate ? event.candidate.toJSON().candidate : '';
      ws.send(JSON.stringify({ type: 'webrtc/candidate', value: candidate }));
      console.log('Accepting ICE candidate:', candidate);
    };
    peerConnection.ontrack = (ev) => {
      this.myVideo.nativeElement.srcObject = ev.streams[0];
    };
    const ws = new WebSocket(getWebSocketUrl('/ws/webrtc?src=' + this.camera()));
    ws.binaryType = 'arraybuffer';
    ws.onopen = async () => {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      ws.send(JSON.stringify({ type: 'webrtc/offer', value: offer.sdp }));
    };
    ws.onmessage = async (msg) => {
      const data = JSON.parse(msg.data);
      switch (data.type) {
        case 'webrtc/candidate':
          if (data.value.includes(' udp ')) {
            return;
          }
          peerConnection.addIceCandidate({ candidate: data.value, sdpMid: '0' });
          break;
        case 'webrtc/answer':
          peerConnection.setRemoteDescription({ type: 'answer', sdp: data.value });
          break;
        case 'error':
          peerConnection.close();
          break;
      }
    };
  }
}
