import { DatePipe, DecimalPipe, NgClass } from '@angular/common';
import { AfterViewInit, Component, computed, ElementRef, input, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { MyEvent } from '../../graph/calendar.model';
import { graphToDate } from '../../graph/graph.model';

@Component({
  selector: 'app-calendar',
  templateUrl: './calendar.html',
  imports: [NgClass, DatePipe, DecimalPipe],
})
export class Calendar implements AfterViewInit {
  readonly events = input.required<MyEvent[]>();
  readonly startDate = input.required<Date>();

  readonly hoursOfDay: number[] = Array.from({ length: 24 }, (_, i) => i);

  readonly scrollContainer = viewChild.required<ElementRef<HTMLDivElement>>('container');
  readonly nowMarker = viewChild.required<ElementRef<HTMLDivElement>>('now');

  /**
   * The days to display in the calendar.
   */
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

  /**
   * Signal that provides the events for a given day.
   * Indexed by the day.
   */
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

  /**
   * Signal that provides the event and the position where it shall appear.
   * Indexed by the day.
   */
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

  constructor() {
    const oncePerMinute = 1000 * 60;
    interval(oncePerMinute)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.updateMarkersAndPosition());
  }

  ngAfterViewInit(): void {
    this.updateMarkersAndPosition();
  }

  isToday(date: Date) {
    const now = new Date();
    return date.getDay() == now.getDay();
  }

  updateMarkersAndPosition() {
    const now = new Date();
    const scrollTop = (now.getHours() - 4) * 100;
    this.scrollContainer().nativeElement.scrollTop = scrollTop;

    const startMinutes = now.getHours() * 60 + now.getMinutes();
    const markerTop = (startMinutes / (24 * 60)) * 100;
    this.nowMarker().nativeElement.style.top = markerTop + '%';
  }
}
