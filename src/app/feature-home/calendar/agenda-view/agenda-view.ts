import { DatePipe, NgClass } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { EventView } from '../../../ms-graph/calendar.model';
import { graphToDate } from '../../../ms-graph/graph.model';
import { AgendaEvent } from './aganda-view.model';

@Component({
  selector: 'app-agenda-view',
  templateUrl: './agenda-view.html',
  imports: [NgClass, DatePipe],
})
export class AgendaView {
  readonly events = input.required<EventView[]>();

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
        const myType = event.myType;

        const start = graphToDate(event.start);
        const end = graphToDate(event.end);
        const past = now > end;

        return { id, subject, myType, start, end, past } as AgendaEvent;
      });
      return eventsByDay.sort((a, b) => a.start.getTime() - b.start.getTime());
    });
  });
}
