import { inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, filter } from 'rxjs';
import { Agenda, CALENDAR_FIELDS, CALENDAR_THEMES, CalendarEntry } from '../backend/backend.model';
import { BackendService } from '../backend/backend.service';
import { EventView, MyEvent } from './calendar.model';

@Injectable({ providedIn: 'root' })
export class CalendarService {
  private readonly backend = inject(BackendService);
  readonly numberOfDays = signal(7);
  readonly events = signal<EventView[]>([]);
  readonly error = signal<string | null>(null);
  readonly loading = signal(false);
  private request = 0;

  constructor() {
    this.backend.changed.pipe(
      filter((change) => change.dataset === 'CALENDAR' || change.dataset === 'ALL'),
      debounceTime(150), takeUntilDestroyed(),
    ).subscribe(() => void this.refreshEvents());
    void this.refreshEvents();
  }

  async refreshEvents() {
    const request = ++this.request;
    this.loading.set(true);
    try {
      const { agenda } = await this.backend.query<{ agenda: Agenda }>(
        `query Agenda($days: Int!) { agenda(days: $days) { revision timezone days {
          date allDay { ${CALENDAR_FIELDS} } events { ${CALENDAR_FIELDS} }
        } } }`, { days: this.numberOfDays() },
      );
      if (request !== this.request) return;
      this.events.set(agenda.days.map((day) => ({
        day: new Date(`${day.date}T12:00:00`),
        allDay: day.allDay.map(toEvent), events: day.events.map(toEvent),
      })));
      this.error.set(null);
    } catch {
      if (request === this.request) this.error.set('Termine konnten nicht aktualisiert werden.');
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }
}

export function toEvent(event: CalendarEntry): MyEvent {
  return {
    id: event.id, subject: event.subject, isAllDay: event.isAllDay,
    start: { dateTime: event.startsAt, timeZone: 'UTC' },
    end: { dateTime: event.endsAt, timeZone: 'UTC' },
    myConfig: { name: event.calendar.name, tailwindClasses: CALENDAR_THEMES[event.calendar.theme] ?? CALENDAR_THEMES['emerald'] },
  };
}
