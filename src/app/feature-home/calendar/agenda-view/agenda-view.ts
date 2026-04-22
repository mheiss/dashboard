import { DatePipe, NgClass } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { EventView } from '../../../ms-graph/calendar.model';
import { graphToDate } from '../../../ms-graph/graph.model';
import { isSameDay } from '../../../utils/date';
import { AgendaEvent } from './agenda-view.model';

@Component({
  selector: 'app-agenda-view',
  templateUrl: './agenda-view.html',
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

        const start = graphToDate(event.start);
        const end = graphToDate(event.end);
        let tailwindClasses = event.myConfig.tailwindClasses;
        if (now > end) {
          tailwindClasses = tailwindClasses + ' opacity-50';
        }
        return { id, subject, start, end, tailwindClasses } as AgendaEvent;
      });
      return eventsByDay.sort((a, b) => a.start.getTime() - b.start.getTime());
    });
  });
}
