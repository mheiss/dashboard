import { DatePipe, NgClass } from '@angular/common';
import { AfterViewInit, Component, computed, ElementRef, input, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { MyEvent } from '../../graph/calendar.model';
import { graphToDate } from '../../graph/graph.model';
import { arrayRange } from '../../utils/array';
import { HourView } from './hour-view/hour-view';

@Component({
  selector: 'app-calendar',
  templateUrl: './calendar.html',
  imports: [NgClass, DatePipe, HourView],
})
export class Calendar implements AfterViewInit {
  readonly events = input.required<MyEvent[]>();
  readonly startDate = input.required<Date>();

  readonly scrollContainer = viewChild.required<ElementRef<HTMLDivElement>>('container');

  /**
   * The days to display in the calendar.
   */
  readonly days = computed(() => {
    const start = this.startDate();
    return arrayRange(0, 2).map((i) => {
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

  constructor() {
    const oncePerMinute = 1000 * 60;
    interval(oncePerMinute)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.updateScrollContainer());
  }

  ngAfterViewInit(): void {
    this.updateScrollContainer();
  }

  isToday(date: Date) {
    const now = new Date();
    return date.getDay() == now.getDay();
  }

  updateScrollContainer() {
    const now = new Date();
    const scrollTop = (now.getHours() - 4) * 100;
    this.scrollContainer().nativeElement.scrollTop = scrollTop;
  }
}
