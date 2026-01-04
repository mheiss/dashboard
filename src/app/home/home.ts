import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval, timer } from 'rxjs';
import { sortByStartDate } from '../graph/calendar.model';
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
  imports: [DatePipe, Calendar, GalleryComponent],
})
export class Home {
  readonly dialog = inject(PopupService);
  readonly openHabService = inject(OpenHABService);
  readonly calendarService = inject(CalendarService);
  readonly imageService = inject(ImageService);

  now = signal(new Date());
  greeting = signal('');

  constructor() {
    interval(1000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.now.set(new Date());
        this.updateGreeting();
      });

    const oncePerHour = 60 * 60 * 1000;
    timer(0, oncePerHour)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.imageService.refreshImages();
        this.calendarService.refreshEvents();
      });
  }

  updateGreeting() {
    const hour = this.now().getHours();
    if (hour < 12) {
      this.greeting.set('Guten Morgen!');
    } else if (hour < 18) {
      this.greeting.set('Hallo!');
    } else {
      this.greeting.set('Guten Abend!');
    }
  }

  openKeypad() {
    this.dialog.open(Pin, {
      hideActionBar: true,
    });
  }
}
