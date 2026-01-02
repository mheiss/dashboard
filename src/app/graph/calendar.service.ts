import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  CalendarType,
  DateRange,
  getCalendarEvents,
  getCalendarGroupCalendars,
  getCalendarGroups,
  MyCalendar,
  MyEvent,
  next24Hours,
} from './calendar.model';

@Injectable({ providedIn: 'root' })
export class CalendarService {
  private readonly httpClient = inject(HttpClient);
  private readonly calendars: CalendarType[] = ['Familie', 'Sarah', 'Lena'];

  /**
   * All calendar events
   */
  readonly events = signal<MyEvent[]>([]);

  /**
   * All events that are full-day
   */
  readonly allDayEvents = signal<MyEvent[]>([]);

  /** Refreshes the calendar events */
  async refreshEvents() {
    const groups = await firstValueFrom(getCalendarGroups(this.httpClient));

    // Loop through all calendars in all groups to find the desired ones
    let myCalendars: MyCalendar[] = [];
    for (const group of groups) {
      if (!group.id) {
        continue;
      }
      const calendarsInGroup = await this.getCalendarGroupCalendars(group.id);
      myCalendars = myCalendars.concat(calendarsInGroup);
    }

    // Now loop through all calendars and fetch the events
    const range = next24Hours();
    for (const myCalendar of myCalendars) {
      const events = await this.getCalendarEvents(myCalendar, range);

      this.events.update((entries) => {
        const filtered = entries.filter((entry) => entry.myType !== myCalendar.myType);
        return filtered.concat(events);
      });
    }
  }

  /**
   * Returns the shared calendars to display
   */
  private async getCalendarGroupCalendars(groupId: string): Promise<MyCalendar[]> {
    const result: MyCalendar[] = [];
    const calendars = await firstValueFrom(getCalendarGroupCalendars(this.httpClient, groupId));
    for (const calendar of calendars) {
      if (!calendar.id) {
        continue;
      }
      const calendarName = calendar.name;
      const calendarType = calendarName as CalendarType;
      if (calendarName && !this.calendars.includes(calendarType)) {
        continue;
      }
      const myCalendar = calendar as MyCalendar;
      myCalendar.myType = calendarType;
      myCalendar.myGroupId = groupId;
      result.push(myCalendar);
    }
    return result;
  }

  /**
   * Lists all events matching the given query.
   */
  async getCalendarEvents(calendar: MyCalendar, range: DateRange): Promise<MyEvent[]> {
    const events = await firstValueFrom(getCalendarEvents(this.httpClient, range, calendar.myGroupId, calendar.id));
    const myEvents = events.map((e) => e as MyEvent);
    myEvents.forEach((e) => (e.myType = calendar.myType));
    return myEvents;
  }
}
