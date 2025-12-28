import { DIALOG_DATA, DialogModule, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, InjectionToken, input } from '@angular/core';
import { DialogOptions } from './popup.service';

const POPUP_DATA = new InjectionToken<DialogOptions>('POPUP_DATA');

@Component({
  selector: 'app-popup',
  templateUrl: './popup.html',
  imports: [DialogModule],
  providers: [
    {
      provide: POPUP_DATA,
      useFactory: () => {
        const dialogOptions = inject(DIALOG_DATA) as DialogOptions;
        return dialogOptions?.data;
      },
    },
  ],
})
export class Popup {
  readonly title = input.required<string>();
  readonly dialogRef = inject(DialogRef);
  readonly options = inject(DIALOG_DATA);

  onCancel() {
    this.dialogRef.close(false);
  }
  onConfirm() {
    this.dialogRef.close(true);
  }

  hideActionBar() {
    return this.options?.hideActionBar;
  }
}
