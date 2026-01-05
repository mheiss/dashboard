import { DatePipe, NgClass } from '@angular/common';
import { AfterViewInit, Component, effect, ElementRef, input, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { CalendarView, EventView, getPercentageOfDay, isCalendarView } from '../../ms-graph/calendar.model';
import { AgendaView } from './agenda-view/agenda-view';
import { DayView } from './day-view/day-view';

/**
 * Key used to store the current view
 */
const VIEW_KEY = 'app.dashboard.calendar.view';

@Component({
  selector: 'app-calendar',
  templateUrl: './calendar.html',
  imports: [NgClass, DatePipe, DayView, AgendaView],
})
export class Calendar implements AfterViewInit {
  readonly events = input.required<EventView[]>();
  readonly view = signal<CalendarView>('Agenda');

  readonly scrollContainer = viewChild.required<ElementRef<HTMLDivElement>>('container');

  constructor() {
    const oncePerMinute = 1000 * 60;
    interval(oncePerMinute)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.updateScrollContainer());

    const storedView = localStorage.getItem(VIEW_KEY);
    if (isCalendarView(storedView)) {
      this.view.set(storedView);
    }

    effect(() => {
      const viewValue = this.view();
      localStorage.setItem(VIEW_KEY, viewValue);
    });
  }

  ngAfterViewInit(): void {
    this.updateScrollContainer();
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

    const scrollTo = (totalHeight * getPercentageOfDay()) / 100.0;
    div.scrollTop = scrollTo;
  }
}
