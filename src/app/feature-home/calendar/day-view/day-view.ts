import { DecimalPipe, NgClass } from '@angular/common';
import { Component, computed, ElementRef, input, OnInit, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { EventView, getPercentageOfDay, sortByStartDate } from '../../../ms-graph/calendar.model';
import { arrayRange } from '../../../utils/array';
import { alignPosition, convert } from './day-view.model';

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
   * Index of the array represents a day.
   */
  readonly positionedEvents = computed(() => {
    return this.events().map((view) => {
      const sortedAndMapped = view.events.sort(sortByStartDate).map(convert);
      alignPosition(sortedAndMapped);
      return sortedAndMapped;
    });
  });

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
