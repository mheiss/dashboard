import { Injectable, signal } from '@angular/core';
import { WebSocket } from 'partysocket';
import { interval } from 'rxjs';
import { getWebSocketUrl } from '../utils/webSocket';

const OpenHabPing = {
  type: 'WebSocketEvent',
  topic: 'openhab/websocket/heartbeat',
  payload: 'PING',
  source: 'WebSocketTestInstance',
};

@Injectable({ providedIn: 'root' })
export class OpenHABApi {
  private readonly ws = this.createWebSocket();

  public readonly status = signal(false);
  public readonly message = signal('');

  startPingPong() {
    interval(5000).subscribe(() => {
      if (this.status()) {
        this.ws.send(JSON.stringify(OpenHabPing));
      }
    });
  }

  private createWebSocket() {
    const ws = new WebSocket(getWebSocketUrl('/ws/openhab'), 'org.openhab.ws.protocol.default');
    ws.addEventListener('open', () => this.onOpen());
    ws.addEventListener('error', (e) => this.onError(e));
    ws.addEventListener('message', (e) => this.onMessage(e));
    return ws;
  }

  private onOpen(): void {
    console.log('WebSocket connection with OpenHAB established.');
    this.status.set(true);
  }

  private onError(e: any): void {
    console.log('OpenHAB: WebSocket error occurred.', e);
    this.status.set(false);
  }

  private onMessage(e: MessageEvent<any>): void {
    this.message.set(e.data);
  }
}
