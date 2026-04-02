import { HttpClient } from '@angular/common/http';
import { WebSocket } from 'partysocket';
import { BehaviorSubject } from 'rxjs';
import { DebugService } from '../utils/debug.service';
import { createCommandEvent, createStringPayload, onOffConverter, stringConverter } from './openhab.model';
import { Openhab } from './openhab';

/**
 * Represents an item in openhab.
 */
export abstract class OpenHabItem<T> {
  private readonly value = new BehaviorSubject<T | null>(null);
  public readonly value$ = this.value.asObservable();

  constructor(
    protected ws: WebSocket,
    protected client: HttpClient,
    protected items: OpenHabItem<any>[],
    protected itemName: string,
    protected converter: (value: string) => T,
    protected debug: DebugService,
  ) {
    client.get('/api/openhab/items/' + itemName + '/state', { responseType: 'text' }).subscribe((value) => {
      this.onWebSocketMessage(value);
    });
    items.push(this);
  }

  /**
   * Updates the value of this item using the received payload
   */
  public onWebSocketMessage(value: string) {
    this.value.next(this.converter(value));
    this.debug.log(`Item '${this.itemName}' has been updated to '${value}'`);
  }

  /**
   * Returns the name of the websocket topic of this item
   */
  public topicName() {
    return 'openhab/items/' + this.itemName + '/stateupdated';
  }
}
export class PinItem extends OpenHabItem<string> {
  constructor(ws: WebSocket, client: HttpClient, items: OpenHabItem<any>[], debug: DebugService) {
    super(ws, client, items, 'Security_Pin', stringConverter, debug);
  }

  /**
   * Attempts to disarm the security system using the given pin code.
   */
  sendPinCode(pinCode: string) {
    const pinPayload = createStringPayload(pinCode);
    const message = createCommandEvent(this.itemName, pinPayload);
    this.ws.send(JSON.stringify(message));
  }
}

export class SecurityItem extends OpenHabItem<boolean> {
  constructor(ws: WebSocket, client: HttpClient, items: OpenHabItem<any>[], debug: DebugService) {
    super(ws, client, items, 'Security', onOffConverter, debug);
  }
}

export class DoorbellItem extends OpenHabItem<boolean> {
  constructor(ws: WebSocket, client: HttpClient, items: OpenHabItem<any>[], debug: DebugService) {
    super(ws, client, items, 'Entrance_Bell_Switch', onOffConverter, debug);
  }
}
