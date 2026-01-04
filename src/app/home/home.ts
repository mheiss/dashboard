import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { timer } from 'rxjs';
import { CalendarService } from '../graph/calendar.service';
import { ImageService } from '../graph/image.service';
import { OpenHABService } from '../openhab/openhab.service';
import { Pin } from '../pin/pin';
import { PopupService } from '../popup/popup.service';
import { Calendar } from './calendar/calendar';
import { GalleryComponent } from './gallery/gallery';

@Component({
  selector: 'app-home',
  templateUrl: './home.html',
  imports: [Calendar, GalleryComponent],
})
export class Home {
  readonly dialog = inject(PopupService);
  readonly openHabService = inject(OpenHABService);
  readonly calendarService = inject(CalendarService);
  readonly imageService = inject(ImageService);

  constructor() {
    const oncePerHour = 60 * 60 * 1000;
    timer(0, oncePerHour)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.imageService.refreshImages();
        this.calendarService.refreshEvents();
      });
  }

  openKeypad() {
    this.dialog.open(Pin, {
      hideActionBar: true,
    });
  }
}
