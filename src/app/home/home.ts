import { Dialog } from '@angular/cdk/dialog';
import { Component, inject } from '@angular/core';
import { OpenHABApi } from '../openhab/openhab.service';
import { Pin } from '../pin/pin';
import { PopupService } from '../popup/popup.service';
import { AsyncPipe } from '@angular/common';

@Component({
  selector: 'app-home',
  templateUrl: './home.html',
  imports: [AsyncPipe],
})
export class Home {
  readonly dialog = inject(PopupService);
  readonly openHabApi = inject(OpenHABApi);

  openKeypad() {
    this.dialog.open(Pin, {
      hideActionBar: true,
    });
  }
}
