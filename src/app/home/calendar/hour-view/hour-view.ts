import { DecimalPipe, NgClass } from '@angular/common';
import { AfterViewInit, Component, computed, ElementRef, input, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { MyEvent } from '../../../graph/calendar.model';
import { graphToDate } from '../../../graph/graph.model';
import { arrayRange } from '../../../utils/array';

@Component({
  selector: 'app-hour-view',
  templateUrl: './hour-view.html',
  imports: [NgClass, DecimalPipe],
})
export class HourView implements AfterViewInit {
  readonly eventsByDay = input.required<MyEvent[][]>();
  readonly hoursOfDay: number[] = arrayRange(0, 23);

  readonly nowMarker = viewChild.required<ElementRef<HTMLDivElement>>('now');

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
      .subscribe(() => this.updateMarker());
  }

  ngAfterViewInit(): void {
    this.updateMarker();
  }

  updateMarker() {
    const now = new Date();

    const startMinutes = now.getHours() * 60 + now.getMinutes();
    const markerTop = (startMinutes / (24 * 60)) * 100;
    this.nowMarker().nativeElement.style.top = markerTop + '%';
  }
}
