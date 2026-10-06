import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { WebSocket } from 'partysocket';
import { filter, interval, pairwise } from 'rxjs';
import { DebugService } from '../utils/debug.service';
import { getWebSocketUrl } from '../utils/webSocket';
import { AppConfigService } from '../feature-config/config.service';
import { DoorbellItem, MotionItem, OpenHabItem, PinItem, SecurityItem, SmartMotionItem } from './openhab.items';
import { Payload, PingEvent } from './openhab.model';
import { FullyService } from './fully.service';
import { MotionService } from '../feature-protect/motion.service';

@Injectable({ providedIn: 'root' })
export class OpenHABService {
  private readonly http = inject(HttpClient);
  private readonly fully = inject(FullyService);
  private readonly router = inject(Router);
  private readonly debug = inject(DebugService);
  private readonly config = inject(AppConfigService);
  private readonly motion = inject(MotionService);
  private readonly ws = this.createWebSocket();
  private readonly items: OpenHabItem<any>[] = [];

  /**
   * The item which holds the activation status of the security.
   *
   * * ON == Armed
   * * OFF == Disarmed
   */
  readonly security = new SecurityItem(this.ws, this.http, this.items, this.config.config().openhab.items.security, this.debug);

  /**
   * The item which accepts the security PIN. If the PIN is correct then the
   * security system will be turned off / disarmed.
   */
  readonly pin = new PinItem(this.ws, this.http, this.items, this.config.config().openhab.items.pin, this.debug);

  /**
   * The doorbell item.
   */
  readonly doorbell = new DoorbellItem(this.ws, this.http, this.items, this.config.config().openhab.items.doorbell, this.debug);

  /**
   * Creates motion items for each camera in the UniFi Protect configuration.
   */
  private readonly motionItems = Object.keys(this.config.config().protect.cameras).flatMap((camera) => {
    const prefix = camera.charAt(0).toUpperCase() + camera.slice(1) + '_Camera_';
    return [
      { camera, item: new MotionItem(this.ws, this.http, this.items, prefix + 'Motion', this.debug), type: 'motion' as const },
      { camera, item: new SmartMotionItem(this.ws, this.http, this.items, prefix + 'SmartMotion', this.debug), type: 'smart' as const },
    ];
  });

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
      const camera = this.config.config().openhab.doorbellCamera;
      if (!Object.hasOwn(this.config.config().protect.cameras, camera)) {
        return;
      }
      this.fully.turnScreenOn();
      this.router.navigate(['/protect'], {
        queryParams: {
          camera,
        },
      });
    });

    // Switch to the camera views when motion is detected on any of the cameras
    for (const { camera, item, type } of this.motionItems) {
      item.value$
        .pipe(
          pairwise(),
          filter(([previous, current]) => previous === false && current === true),
        )
        .subscribe(() => {
          if (!Object.hasOwn(this.config.config().protect.cameras, camera)) {
            return;
          }
          this.motion.capture(camera, type);
          this.fully.turnScreenOn();
          this.router.navigate(['/protect'], { queryParams: { camera } });
        });
    }
  }

  private createWebSocket() {
    const ws = new WebSocket(getWebSocketUrl('/ws/openhab'), 'org.openhab.ws.protocol.default');
    ws.addEventListener('open', () => this.onOpen());
    ws.addEventListener('error', (e) => this.onError(e));
    ws.addEventListener('message', (e) => this.onMessage(e));
    return ws;
  }

  private onOpen(): void {
    this.debug.log('OpenHAB: Connected via WebSocket.');
  }

  private onError(e: any): void {
    this.debug.log('OpenHAB: WebSocket error occurred.', e);
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
