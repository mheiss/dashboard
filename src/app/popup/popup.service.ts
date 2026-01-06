import { Dialog } from '@angular/cdk/dialog';
import { ComponentType } from '@angular/cdk/portal';
import { inject, Injectable, InjectionToken } from '@angular/core';

export interface DialogOptions {
  data?: any;
  disableClose: boolean;
  width?: string;
  height?: string;
}

@Injectable({ providedIn: 'root' })
export class PopupService {
  private readonly dialog = inject(Dialog);

  /**
   * Opens the given component in a popup.
   */
  public open(component: ComponentType<unknown>, options?: DialogOptions) {
    return this.dialog.open<string>(component, {
      data: options,
      disableClose: options?.disableClose,
      panelClass: 'app-dialog-panel',
      backdropClass: 'app-dialog-backdrop',
      width: options?.width,
      height: options?.height,
      maxHeight: options?.height,
      maxWidth: options?.width,
    });
  }
}
