import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AppConfigService } from '../feature-config/config.service';
import { arrayRange } from '../utils/array';
import { isSameDay } from '../utils/date';
import { DateRange, EventView, MyCalendar, MyEvent, nextDays } from './calendar.model';
import { graphToDate } from './graph.model';
import { GraphRestService } from './graph.service';

@Injectable({ providedIn: 'root' })
export class CalendarService {
  private readonly graphService = inject(GraphRestService);
  private readonly appConfigService = inject(AppConfigService);

  /**
   * The calendars to display
   */
  readonly calendars = signal<MyCalendar[]>([]);

  /**
   * The number of days to display
   */
  readonly numberOfDays = signal<number>(4);

  /**
   * All calendar events
   */
  readonly events = signal<EventView[]>([]);

  /**
   * Loads all calendars to be displayed
   */
  constructor() {
    this.getCalendarsToDisplay().then((calendars) => {
      this.calendars.set(calendars);
      this.refreshEvents();
    });
  }

  /** Refreshes the calendar events */
  async refreshEvents() {
    const startDate = new Date();
    const days = arrayRange(0, this.numberOfDays() - 1).map((i) => {
      const d = new Date(startDate);
      d.setHours(23, 59, 59);
      d.setDate(startDate.getDate() + i);
      return d;
    });

    // Now loop through all calendars and fetch the events
    const range = nextDays(this.numberOfDays());
    for (const myCalendar of this.calendars()) {
      const events = await this.getCalendarEvents(myCalendar, range);

      // Replace existing events
      this.events.update((views) => {
        // Remove all events before the start date and clone each day entry so the signal emits.
        let nextViews = views
          .filter((view) => view.day >= startDate)
          .map((view) => ({
            day: view.day,
            allDay: view.allDay.filter((entry) => entry.myConfig.name !== myCalendar.myConfig.name),
            events: view.events.filter((entry) => entry.myConfig.name !== myCalendar.myConfig.name),
          }));

        // create an entry for each day that we shall display
        for (const day of days) {
          const exists = nextViews.find((e) => isSameDay(e.day, day));
          if (!exists) {
            nextViews.push({ day, allDay: [], events: [] });
          }
        }

        // Append events
        for (const event of events) {
          for (const view of nextViews) {
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
        return nextViews.sort((a, b) => a.day.getTime() - b.day.getTime());
      });
    }
  }

  /**
   * Returns the calendars to display according to the configuration.
   */
  private async getCalendarsToDisplay(): Promise<MyCalendar[]> {
    // Fetch all groups
    // Note: Calendars are organized in groups.
    const groups = await firstValueFrom(this.graphService.getCalendarGroups());
    const groupIds: string[] = [];
    for (const group of groups) {
      if (!group.id) {
        continue;
      }
      groupIds.push(group.id);
    }

    // Fetch all calendars of all groups
    let calendars: MyCalendar[] = [];
    for (const groupId of groupIds) {
      const calendarsOfGroup = await firstValueFrom(this.graphService.getCalendarGroupCalendars(groupId));
      const myCalendarsOfGroup = calendarsOfGroup.map((e) => e as MyCalendar);
      myCalendarsOfGroup.forEach((e) => (e.myGroupId = groupId));
      calendars = calendars.concat(myCalendarsOfGroup);
    }

    // Now filter by the calendar to display
    const result: MyCalendar[] = [];
    const calendarConfig = this.appConfigService.config().calendars;
    for (const myCalendar of calendars) {
      const config = calendarConfig.find((c) => c.name === myCalendar.name);
      if (!config) {
        continue;
      }
      myCalendar.myConfig = config;
      result.push(myCalendar);
    }
    return result;
  }

  /**
   * Lists all events of the given matching the given query.
   */
  async getCalendarEvents(calendar: MyCalendar, range: DateRange): Promise<MyEvent[]> {
    const events = await firstValueFrom(this.graphService.getCalendarEvents(range, calendar.myGroupId, calendar.id));
    const myEvents = events.map((e) => e as MyEvent);
    myEvents.forEach((e) => (e.myConfig = calendar.myConfig));
    return myEvents;
  }
}
