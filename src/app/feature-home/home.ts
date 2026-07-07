import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { OpenHABService } from '../feature-openhab/openhab.service';
import { CalendarService } from '../ms-graph/calendar.service';
import { ImageService } from '../ms-graph/image.service';
import { PopupService } from '../popup/popup.service';
import { Calendar } from './calendar/calendar';
import { GalleryComponent } from './gallery/gallery';
import { Pin } from './pin/pin';

@Component({
  selector: 'app-home',
  templateUrl: './home.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [Calendar, GalleryComponent],
})
export class Home {
  readonly dialog = inject(PopupService);

  openKeypad() {
    this.dialog.open(Pin, {
      disableClose: true,
    });
  }
}
