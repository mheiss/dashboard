import { DatePipe, NgClass } from '@angular/common';
import { AfterViewInit, Component, computed, ElementRef, input, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { EventView, MyEvent } from '../../graph/calendar.model';
import { graphToDate } from '../../graph/graph.model';
import { arrayRange } from '../../utils/array';
import { HourView } from './hour-view/hour-view';

@Component({
  selector: 'app-calendar',
  templateUrl: './calendar.html',
  imports: [NgClass, DatePipe, HourView],
})
export class Calendar implements AfterViewInit {
  readonly events = input.required<EventView[]>();

  readonly scrollContainer = viewChild.required<ElementRef<HTMLDivElement>>('container');

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
