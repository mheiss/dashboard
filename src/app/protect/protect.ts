import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { getWebSocketUrl } from '../models/ws';
import { WebSocket } from 'partysocket';
import { WebRTC } from '../webrtc/webrtc';

@Component({
  selector: 'app-protect',
  imports: [WebRTC],
  templateUrl: './protect.html',
})
export class Protect {}
