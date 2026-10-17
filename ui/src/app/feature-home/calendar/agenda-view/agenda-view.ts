import { DatePipe, NgClass } from '@angular/common';
import { Component, computed, input, ChangeDetectionStrategy } from '@angular/core';
import { EventView } from '../calendar.model';
import { isSameDay } from '../../../utils/date';
import { AgendaEvent } from './agenda-view.model';

@Component({
  selector: 'app-agenda-view',
  templateUrl: './agenda-view.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [NgClass, DatePipe],
})
export class AgendaView {
  readonly events = input.required<EventView[]>();

  isToday(day: Date) {
    return isSameDay(day, new Date());
  }

  /**
   * Signal that provides the event in the local date time.
   * Indexed by the day.
   */
  readonly agendaEvents = computed(() => {
    return this.events().map((eventView) => {
      const now = new Date();
      const eventsByDay = eventView.events.map((event) => {
        const id = event.id;
        const subject = event.subject;

        const start = new Date(event.start!.dateTime!);
        const end = new Date(event.end!.dateTime!);
        let tailwindClasses = event.myConfig.tailwindClasses;
        if (now > end) {
          tailwindClasses = tailwindClasses + ' opacity-75';
        }
        return { id, subject, start, end, tailwindClasses } as AgendaEvent;
      });
      return eventsByDay;
    });
  });
}
