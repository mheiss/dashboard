import { DIALOG_DATA, DialogModule, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, input, ChangeDetectionStrategy } from '@angular/core';
import { DialogOptions } from './popup.service';

@Component({
  selector: 'app-popup',
  templateUrl: './popup.html',
  changeDetection: ChangeDetectionStrategy.Eager,
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
