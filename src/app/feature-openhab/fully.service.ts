import { DOCUMENT, inject, Injectable } from '@angular/core';
import { DebugService } from '../utils/debug.service';

@Injectable({ providedIn: 'root' })
export class FullyService {
  private readonly debug = inject(DebugService);

  turnScreenOn() {
    if (window.fully) {
      window.fully.turnScreenOn();
      this.debug.log('Turned screen on.');
    }
  }
}
