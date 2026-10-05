import { Dialog } from '@angular/cdk/dialog';
import { ComponentType } from '@angular/cdk/portal';
import { inject, Injectable, InjectionToken } from '@angular/core';

export interface DialogOptions {
  data?: any;
  disableClose: boolean;
  width?: string;
  height?: string;
  fullScreen?: boolean;
}

@Injectable({ providedIn: 'root' })
export class PopupService {
  private readonly dialog = inject(Dialog);

  /**
   * Opens the given component in a popup.
   */
  public open(component: ComponentType<unknown>, options?: DialogOptions) {
    const width = options?.fullScreen ? '100vw' : options?.width;
    const height = options?.fullScreen ? '100dvh' : options?.height;
    return this.dialog.open<string>(component, {
      data: options,
      disableClose: options?.disableClose,
      panelClass: options?.fullScreen ? [] : 'app-dialog-panel',
      backdropClass: 'app-dialog-backdrop',
      width,
      height,
      maxHeight: height,
      maxWidth: width,
    });
  }
}
