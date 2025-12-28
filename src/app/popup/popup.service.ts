import { Dialog } from '@angular/cdk/dialog';
import { ComponentType } from '@angular/cdk/portal';
import { inject, Injectable } from '@angular/core';

export interface DialogOptions {
  data?: any;
  hideActionBar?: boolean;
}

@Injectable({ providedIn: 'root' })
export class PopupService {
  private readonly dialog = inject(Dialog);

  /**
   * Opens the given component in a popup.
   */
  public open(component: ComponentType<unknown>, options?: DialogOptions) {
    this.dialog.open<string>(component, {
      data: options,
      width: '50%',
      height: '80%',
      disableClose: true,
      panelClass: 'tw-dialog-panel',
      backdropClass: 'tw-dialog-backdrop',
    });
  }
}
