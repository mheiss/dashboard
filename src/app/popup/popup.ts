import { DIALOG_DATA, DialogModule, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, input } from '@angular/core';
import { DialogOptions } from './popup.service';

@Component({
  selector: 'app-popup',
  templateUrl: './popup.html',
  imports: [DialogModule],
})
export class Popup {
  readonly data = inject(DIALOG_DATA) as DialogOptions;
  readonly popupRef = inject(DialogRef);
  readonly title = input<string>();

  close() {
    this.popupRef.close();
  }
}
