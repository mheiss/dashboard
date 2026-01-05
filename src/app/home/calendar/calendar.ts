import { DatePipe, NgClass } from '@angular/common';
import { AfterViewInit, Component, ElementRef, input, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { CalendarView, EventView } from '../../graph/calendar.model';
import { AgendaView } from './agenda-view/agenda-view';
import { DayView } from './day-view/day-view';

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
    const now = new Date();
    const scrollTop = (now.getHours() - 4) * 100;
    this.scrollContainer().nativeElement.scrollTop = scrollTop;
  }
}
