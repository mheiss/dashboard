import { Dialog } from '@angular/cdk/dialog';
import { ComponentType } from '@angular/cdk/portal';
import { inject, Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PopupService {
  private readonly dialog = inject(Dialog);

  /**
   * Opens the given component in a popup.
   */
  public open(component: ComponentType<unknown>, data?: any) {
    this.dialog.open<string>(component, {
      data: data,
      width: '250px',
      panelClass: 'tw-dialog-panel',
      backdropClass: 'tw-dialog-backdrop',
    });
  }
}
