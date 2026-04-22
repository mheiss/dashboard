import { Component, ElementRef, inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { getPercentageOfDay } from '../../ms-graph/calendar.model';
import { CalendarService } from '../../ms-graph/calendar.service';
import { LayoutService } from '../../utils/layout.service';
import { AgendaView } from './agenda-view/agenda-view';

@Component({
  selector: 'app-calendar',
  templateUrl: './calendar.html',
  imports: [AgendaView],
})
export class Calendar {
  readonly layout = inject(LayoutService);
  readonly source = inject(CalendarService);

  readonly events = this.source.events.asReadonly();

  readonly scrollContainer = viewChild.required<ElementRef<HTMLDivElement>>('container');

  constructor() {
    const oneMinute = 1000 * 60;
    interval(oneMinute)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.updateScrollContainer());

    const tenMinutes = 1000 * 10 * 60;
    interval(tenMinutes)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.source.refreshEvents());

    setTimeout(() => this.updateScrollContainer(), 0);
  }

  updateScrollContainer() {
    const div = this.scrollContainer().nativeElement;
    const totalHeight = div.scrollHeight;

    const scrollTo = (totalHeight * (getPercentageOfDay() - 10)) / 100.0;
    div.scrollTop = scrollTo;
  }
}
