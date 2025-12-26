import { DialogModule, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, input } from '@angular/core';

@Component({
  selector: 'app-popup',
  templateUrl: './popup.html',
  imports: [DialogModule],
})
export class Popup {
  readonly title = input.required<string>();
  readonly dialogRef = inject(DialogRef);

  onCancel() {
    this.dialogRef.close(false);
  }
  onConfirm() {
    this.dialogRef.close(true);
  }
}
