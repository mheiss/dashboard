import { DialogModule } from '@angular/cdk/dialog';
import { Component, input } from '@angular/core';

@Component({
  selector: 'app-popup',
  templateUrl: './popup.html',
  imports: [DialogModule],
})
export class Popup {
  readonly title = input.required<string>();
}
