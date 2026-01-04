import { DatePipe, DecimalPipe, NgClass } from '@angular/common';
import { Component, computed, input, signal } from '@angular/core';
import { MyEvent } from '../../graph/calendar.model';
import { graphToDate } from '../../graph/graph.model';

@Component({
  selector: 'app-calendar',
  templateUrl: './calendar.html',
  imports: [NgClass, DatePipe, DecimalPipe],
})
export class Calendar {
  readonly events = input.required<MyEvent[]>();

  readonly hoursOfDay: number[] = Array.from({ length: 24 }, (_, i) => i);

  readonly startDate = signal<Date>(new Date());

  readonly days = computed(() => {
    const start = this.startDate();
    return Array.from({ length: 3 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  });

  // All-day events
  readonly allDayEvents = computed(() => this.events().filter((ev) => ev.isAllDay));

  // Events grouped by day
  readonly eventsByDay = computed(() => {
    const days = this.days();
    const events = this.events();

    return days.map((day) => {
      const dayStart = new Date(day);
      dayStart.setHours(0, 0, 0, 0);

      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59);

      return events.filter((ev) => {
        const start = graphToDate(ev.start);
        return start >= dayStart && start <= dayEnd && !ev.isAllDay;
      });
    });
  });

  // Positioning helpers (percentage-based)
  readonly positionedEvents = computed(() =>
    this.eventsByDay().map((dayEvents) =>
      dayEvents.map((ev) => {
        const start = graphToDate(ev.start);
        const end = graphToDate(ev.end);

        const startMinutes = start.getHours() * 60 + start.getMinutes();
        const endMinutes = end.getHours() * 60 + end.getMinutes();

        const top = (startMinutes / (24 * 60)) * 100;
        const height = ((endMinutes - startMinutes) / (24 * 60)) * 100;

        return { ev, top, height };
      }),
    ),
  );
}
