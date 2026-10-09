import { Component, ElementRef, inject, viewChild, ChangeDetectionStrategy } from '@angular/core';
import { getPercentageOfDay } from '../../ms-graph/calendar.model';
import { CalendarService } from '../../ms-graph/calendar.service';
import { LayoutService } from '../../utils/layout.service';
import { AgendaView } from './agenda-view/agenda-view';
import { LucideCalendarDays } from '@lucide/angular';

@Component({
  selector: 'app-calendar',
  templateUrl: './calendar.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [AgendaView, LucideCalendarDays],
})
export class Calendar {
  readonly layout = inject(LayoutService);
  readonly source = inject(CalendarService);
  readonly events = this.source.events.asReadonly();

}
