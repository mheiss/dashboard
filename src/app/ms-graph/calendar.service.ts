import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CalendarConfig } from '../feature-config/config.model';
import { AppConfigService } from '../feature-config/config.service';
import { arrayRange } from '../utils/array';
import { isSameDay } from '../utils/date';
import { DateRange, EventView, MyCalendar, MyEvent, nextDays } from './calendar.model';
import { graphToDate } from './graph.model';
import { GraphRestService } from './graph.service';
import { Calendar, Event } from '@microsoft/microsoft-graph-types';

@Injectable({ providedIn: 'root' })
export class CalendarService {
  private readonly graphService = inject(GraphRestService);
  private readonly appConfigService = inject(AppConfigService);

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
    const groups = await firstValueFrom(this.graphService.getCalendarGroups());

    const startDate = new Date();
    const days = arrayRange(0, this.numberOfDays() - 1).map((i) => {
      const d = new Date(startDate);
      d.setHours(23, 59, 59);
      d.setDate(startDate.getDate() + i);
      return d;
    });
    const config = this.appConfigService.config();

    // Loop through all calendars in all groups to find the desired ones
    let myCalendars: MyCalendar[] = [];
    for (const group of groups) {
      if (!group.id) {
        continue;
      }
      const calendarsInGroup = await this.getCalendarGroupCalendars(config.calendar, group.id);
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
          view.allDay = view.allDay.filter((entry) => entry.myConfig.id !== myCalendar.myConfig.id);
          view.events = view.events.filter((entry) => entry.myConfig.id !== myCalendar.myConfig.id);
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
  private async getCalendarGroupCalendars(configs: CalendarConfig[], groupId: string): Promise<MyCalendar[]> {
    const result: MyCalendar[] = [];
    const calendars = await firstValueFrom(this.graphService.getCalendarGroupCalendars(groupId));
    for (const calendar of calendars) {
      if (!calendar.id) {
        continue;
      }
      const calendarName = calendar.name;
      const config = configs.find((c) => c.id === calendar.name);
      if (!config) {
        continue;
      }
      const myCalendar = calendar as MyCalendar;
      myCalendar.myConfig = config;
      myCalendar.myGroupId = groupId;
      result.push(myCalendar);
    }
    return result;
  }

  /**
   * Lists all events matching the given query.
   */
  async getCalendarEvents(calendar: MyCalendar, range: DateRange): Promise<MyEvent[]> {
    const events = await firstValueFrom(this.graphService.getCalendarEvents(range, calendar.myGroupId, calendar.id));
    const myEvents = events.map((e) => e as MyEvent);
    myEvents.forEach((e) => (e.myConfig = calendar.myConfig));
    return myEvents;
  }
}
