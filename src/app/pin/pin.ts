import { Component, signal } from '@angular/core';
import { Popup } from '../popup/popup';
import { NgClass } from '@angular/common';

@Component({
  selector: 'app-pin',
  templateUrl: './pin.html',
  imports: [Popup, NgClass],
})
export class Pin {
  readonly keys = signal(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']);
  readonly values = signal(['', '', '', '']);

  keyPressed(key: string) {
    this.values.update((values) => {
      const nextIdx = values.findIndex((value) => value === '');
      values[nextIdx] = key;
      return values;
    });
  }
}
