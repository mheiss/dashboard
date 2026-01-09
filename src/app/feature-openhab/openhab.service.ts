import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { WebSocket } from 'partysocket';
import { interval } from 'rxjs';
import { getWebSocketUrl } from '../utils/webSocket';
import { DoorbellItem, OpenHabItem, PinItem, SecurityItem } from './openhab.items';
import { Payload, PingEvent } from './openhab.model';
import { FullyService } from './fully.service';

@Injectable({ providedIn: 'root' })
export class OpenHABService {
  private readonly http = inject(HttpClient);
  private readonly fully = inject(FullyService);
  private readonly router = inject(Router);
  private readonly ws = this.createWebSocket();
  private readonly items: OpenHabItem<any>[] = [];

  /**
   * The item which holds the activation status of the security.
   *
   * * ON == Armed
   * * OFF == Disarmed
   */
  readonly security = new SecurityItem(this.ws, this.http, this.items);

  /**
   * The item which accepts the security PIN. If the PIN is correct then the
   * security system will be turned off / disarmed.
   */
  readonly pin = new PinItem(this.ws, this.http, this.items);

  /**
   * The doorbell item.
   */
  readonly doorbell = new DoorbellItem(this.ws, this.http, this.items);

  /**
   * Initializes the communication between the dashboard and openHAB
   */
  init() {
    // Starts sending PING messages to openhab in order to keep our WS connection alive
    interval(5000).subscribe(() => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(PingEvent));
      }
    });
    // Switch to the camera views when the doorbell rings
    this.doorbell.value$.subscribe((value) => {
      if (!value) {
        return;
      }
      this.fully.turnScreenOn();
      this.router.navigate(['/protect'], {
        queryParams: {
          camera: 'entry',
        },
      });
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
    for (const item of this.items) {
      if (topic === item.topicName()) {
        const payload: Payload = JSON.parse(event.payload);
        item.onWebSocketMessage(payload.value);
      }
    }
  }
}
