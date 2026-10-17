import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideCalendarDays } from '@lucide/angular';
import { CalendarService } from './calendar.service';
import { LayoutService } from '../../utils/layout.service';
import { AgendaView } from './agenda-view/agenda-view';

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
