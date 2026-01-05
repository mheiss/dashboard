import { DecimalPipe, NgClass } from '@angular/common';
import { AfterViewInit, Component, computed, ElementRef, input, OnInit, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { EventView, getPercentageOfDay } from '../../../ms-graph/calendar.model';
import { graphToDate } from '../../../ms-graph/graph.model';
import { arrayRange } from '../../../utils/array';

@Component({
  selector: 'app-day-view',
  templateUrl: './day-view.html',
  imports: [NgClass, DecimalPipe],
})
export class DayView implements OnInit {
  readonly events = input.required<EventView[]>();
  readonly hoursOfDay: number[] = arrayRange(0, 23);

  readonly nowMarker = viewChild.required<ElementRef<HTMLDivElement>>('now');

  /**
   * Signal that provides the event and the position where it shall appear.
   * Indexed by the day.
   */
  readonly positionedEvents = computed(() =>
    this.events().map((eventView) => {
      return eventView.events.map((event) => {
        const id = event.id;
        const subject = event.subject;
        const myType = event.myType;
        const start = graphToDate(event.start);
        const end = graphToDate(event.end);

        const startMinutes = start.getHours() * 60 + start.getMinutes();
        const endMinutes = end.getHours() * 60 + end.getMinutes();

        const top = (startMinutes / (24 * 60)) * 100;
        const height = ((endMinutes - startMinutes) / (24 * 60)) * 100;

        return { id, subject, myType, top, height };
      });
    }),
  );

  constructor() {
    const oncePerMinute = 1000 * 60;
    interval(oncePerMinute)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.updateMarker());
  }

  ngOnInit(): void {
    setTimeout(() => this.updateMarker(), 0);
  }

  updateMarker() {
    const div = this.nowMarker().nativeElement;
    div.style.top = getPercentageOfDay() + '%';
  }
}
