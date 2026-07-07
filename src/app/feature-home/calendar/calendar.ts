import { Component, ElementRef, inject, viewChild, ChangeDetectionStrategy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { getPercentageOfDay } from '../../ms-graph/calendar.model';
import { CalendarService } from '../../ms-graph/calendar.service';
import { LayoutService } from '../../utils/layout.service';
import { AgendaView } from './agenda-view/agenda-view';

@Component({
  selector: 'app-calendar',
  templateUrl: './calendar.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [AgendaView],
})
export class Calendar {
  readonly layout = inject(LayoutService);
  readonly source = inject(CalendarService);
  readonly events = this.source.events.asReadonly();

  constructor() {
    const tenMinutes = 1000 * 10 * 60;
    interval(tenMinutes)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.source.refreshEvents());
  }
}
