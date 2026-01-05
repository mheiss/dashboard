import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { WebSocket } from 'partysocket';
import { BehaviorSubject, interval } from 'rxjs';
import { getWebSocketUrl } from '../utils/webSocket';
import { PIN, SECURITY } from './openhab.items';
import { createCommandEvent, createStringPayload, Payload, PingEvent } from './openhab.model';

@Injectable({ providedIn: 'root' })
export class OpenHABService {
  private readonly http = inject(HttpClient);
  private readonly ws = this.createWebSocket();

  /**
   * The security status of the system.
   * * TRUE = On / Armed
   * * FALSE = Off / Disarmed
   */
  private readonly securityStatus = new BehaviorSubject<boolean>(false);
  public readonly securityStatus$ = this.securityStatus.asObservable();

  constructor() {
    this.http.get('/api/openhab/items/' + SECURITY + '/state', { responseType: 'text' }).subscribe((v) => {
      this.securityStatus.next(v === 'ON');
    });
  }

  /**
   * Starts sending PING messages to openhab in order to keep our WS connection alive
   */
  startPingPong() {
    interval(5000).subscribe(() => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(PingEvent));
      }
    });
  }

  /**
   * Attempts to disarm the security system using the given pin code.
   */
  disarmSecurity(pinCode: string) {
    const pinPayload = createStringPayload(pinCode);
    const message = createCommandEvent(PIN, pinPayload);
    this.ws.send(JSON.stringify(message));
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
  }

  private onError(e: any): void {
    console.log('OpenHAB: WebSocket error occurred.', e);
  }

  private onMessage(e: MessageEvent<any>): void {
    const event = JSON.parse(e.data);
    if (event?.type === 'ItemStateUpdatedEvent') {
      this.onItemUpdateEvent(event);
    }
  }

  private onItemUpdateEvent(event: any) {
    const topic = event.topic as string;
    if (topic === 'openhab/items/' + SECURITY + '/stateupdated') {
      const payload: Payload = JSON.parse(event.payload);
      this.securityStatus.next(payload.value === 'ON' ? true : false);
    }
  }
}
