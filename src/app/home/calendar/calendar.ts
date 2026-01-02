import { DatePipe, NgClass } from '@angular/common';
import { Component, input } from '@angular/core';
import { MyEvent } from '../../graph/calendar.model';

@Component({
  selector: 'app-calendar',
  templateUrl: './calendar.html',
  imports: [DatePipe, NgClass],
})
export class Calendar {
  readonly allDayEvents = input.required<MyEvent[]>();
  readonly timedEvents = input.required<MyEvent[]>();
}
