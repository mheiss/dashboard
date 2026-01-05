import { Component, computed, input } from '@angular/core';
import { EventView } from '../../../graph/calendar.model';
import { DatePipe, NgClass } from '@angular/common';
import { graphToDate } from '../../../graph/graph.model';

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
  readonly agendaEvents = computed(() =>
    this.events().map((eventView) => {
      return eventView.events.map((event) => {
        const id = event.id;
        const subject = event.subject;
        const myType = event.myType;

        const start = graphToDate(event.start);
        const end = graphToDate(event.end);

        return { id, subject, myType, start, end };
      });
    }),
  );
}
