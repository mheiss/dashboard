import { DOCUMENT, inject, Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class FullyService {
  turnScreenOn() {
    if (window.fully) {
      window.fully.turnScreenOn();
      console.log('Turned screen on.');
    }
  }
}
