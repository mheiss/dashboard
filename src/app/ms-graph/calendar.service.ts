import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { arrayRange } from '../utils/array';
import { isSameDay } from '../utils/date';
import {
  DateRange,
  EventView,
  getCalendarEvents,
  getCalendarGroupCalendars,
  getCalendarGroups,
  isCalendarType,
  MyCalendar,
  MyEvent,
  nextDays,
} from './calendar.model';
import { graphToDate } from './graph.model';

@Injectable({ providedIn: 'root' })
export class CalendarService {
  private readonly httpClient = inject(HttpClient);

  /**
   * The number of days to display
   */
  readonly numberOfDays = signal<number>(3);

  /**
   * All calendar events
   */
  readonly events = signal<EventView[]>([]);

  /** Refreshes the calendar events */
  async refreshEvents() {
    const groups = await firstValueFrom(getCalendarGroups(this.httpClient));

    const startDate = new Date();
    const days = arrayRange(0, this.numberOfDays() - 1).map((i) => {
      const d = new Date(startDate);
      d.setHours(23, 59, 59);
      d.setDate(startDate.getDate() + i);
      return d;
    });

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
    const range = nextDays(this.numberOfDays());
    for (const myCalendar of myCalendars) {
      const events = await this.getCalendarEvents(myCalendar, range);

      // Replace existing events
      this.events.update((views) => {
        // Remove all events are before the start date
        views = views.filter((view) => view.day >= startDate);

        // create an entry for each day that we shall display
        for (const day of days) {
          const exists = views.find((e) => isSameDay(e.day, day));
          if (!exists) {
            views.push({ day: day, allDay: [], events: [] });
          }
        }

        // Replace events of the calendar that we queried
        for (const view of views) {
          view.allDay = view.allDay.filter((entry) => entry.myType !== myCalendar.myType);
          view.events = view.events.filter((entry) => entry.myType !== myCalendar.myType);
        }
        // Append events
        for (const event of events) {
          for (const view of views) {
            // Add all-day events to each slot
            if (event.isAllDay) {
              const dayEnd = new Date(view.day);
              dayEnd.setHours(23, 59, 59);

              const start = graphToDate(event.start);
              const end = graphToDate(event.end);
              if (start <= dayEnd && dayEnd <= end) {
                view.allDay.push(event);
              }
            } else {
              const dayStart = new Date(view.day);
              dayStart.setHours(0, 0, 0, 0);

              const dayEnd = new Date(view.day);
              dayEnd.setHours(23, 59, 59);

              const start = graphToDate(event.start);
              if (start >= dayStart && start <= dayEnd) {
                view.events.push(event);
              }
            }
          }
        }
        return views;
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
      if (!isCalendarType(calendarName)) {
        continue;
      }
      const myCalendar = calendar as MyCalendar;
      myCalendar.myType = calendarName;
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
