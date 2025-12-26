import { Dialog } from '@angular/cdk/dialog';
import { Component, inject } from '@angular/core';
import { OpenHABApi } from '../openhab/openhab.service';
import { Keypad } from '../keypad/keypad';
import { PopupService } from '../popup/popup.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.html',
})
export class Home {
  readonly dialog = inject(PopupService);
  readonly openHabApi = inject(OpenHABApi);

  openKeypad() {
    this.dialog.open(Keypad);
  }
}
