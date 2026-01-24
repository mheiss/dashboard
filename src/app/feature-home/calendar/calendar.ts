import { DatePipe, NgClass } from '@angular/common';
import { Component, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { CalendarView, getPercentageOfDay, isCalendarView } from '../../ms-graph/calendar.model';
import { CalendarService } from '../../ms-graph/calendar.service';
import { getCalendarView, saveCalendarView } from '../../ms-graph/database';
import { LayoutService } from '../../utils/layout.service';
import { AgendaView } from './agenda-view/agenda-view';
import { DayView } from './day-view/day-view';

@Component({
  selector: 'app-calendar',
  templateUrl: './calendar.html',
  imports: [NgClass, DatePipe, DayView, AgendaView],
})
export class Calendar {
  readonly layout = inject(LayoutService);
  readonly source = inject(CalendarService);

  readonly events = this.source.events.asReadonly();
  readonly view = signal<CalendarView>('Agenda');

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

    getCalendarView().then((view) => {
      if (isCalendarView(view)) {
        this.view.set(view);
      }
    });

    effect(() => {
      saveCalendarView(this.view());
      setTimeout(() => this.updateScrollContainer(), 0);
    });
  }

  switchView() {
    this.view.update((view) => {
      if (view === 'Agenda') {
        return 'Day';
      }
      if (view === 'Day') {
        return 'Agenda';
      }
      return view;
    });
  }

  isToday(date: Date) {
    const now = new Date();
    return date.getDate() == now.getDate();
  }

  updateScrollContainer() {
    const div = this.scrollContainer().nativeElement;
    const totalHeight = div.scrollHeight;

    const scrollTo = (totalHeight * (getPercentageOfDay() - 10)) / 100.0;
    div.scrollTop = scrollTo;
  }
}
