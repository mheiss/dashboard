import { DatePipe, NgClass } from '@angular/common';
import { Component, effect, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { CalendarView, EventView, getPercentageOfDay, isCalendarView } from '../../ms-graph/calendar.model';
import { getCalendarView, saveCalendarView } from '../../ms-graph/database';
import { AgendaView } from './agenda-view/agenda-view';
import { DayView } from './day-view/day-view';
import { LayoutService } from '../../utils/layout.service';

@Component({
  selector: 'app-calendar',
  templateUrl: './calendar.html',
  imports: [NgClass, DatePipe, DayView, AgendaView],
})
export class Calendar {
  readonly layout = inject(LayoutService);

  readonly events = input.required<EventView[]>();
  readonly view = signal<CalendarView>('Agenda');

  readonly scrollContainer = viewChild.required<ElementRef<HTMLDivElement>>('container');

  constructor() {
    const oncePerMinute = 1000 * 60;
    interval(oncePerMinute)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.updateScrollContainer());

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
    return date.getDay() == now.getDay();
  }

  updateScrollContainer() {
    const div = this.scrollContainer().nativeElement;
    const totalHeight = div.scrollHeight;

    const scrollTo = (totalHeight * (getPercentageOfDay() - 10)) / 100.0;
    div.scrollTop = scrollTo;
  }
}
