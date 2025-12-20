import { Dialog } from '@angular/cdk/dialog';
import { Component, inject } from '@angular/core';
import { OpenHABApi } from '../openhab/openhab.service';
import { Keypad } from '../keypad/keypad';

@Component({
  selector: 'app-home',
  imports: [],
  templateUrl: './home.html',
})
export class Home {
  readonly dialog = inject(Dialog);

  readonly openHabApi = inject(OpenHABApi);

  openKeypad() {
    this.dialog.open<string>(Keypad, {
      width: '250px',
      panelClass: 'tw-dialog-panel',
      backdropClass: 'tw-dialog-backdrop',
    });
  }
}
