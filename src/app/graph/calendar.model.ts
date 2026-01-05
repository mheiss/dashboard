import { HttpClient } from '@angular/common/http';
import { Calendar, CalendarGroup, Event } from '@microsoft/microsoft-graph-types';
import { map, Observable } from 'rxjs';
import { MY_GRAPH, GraphListResponse } from './graph.model';

/**
 * Types of calendars to display.
 */
export type CalendarType = 'Familie' | 'Sarah' | 'Lena';

/**
 * Display type
 */
export type CalendarView = 'Day' | 'Agenda';

/**
 * Associates the type and the group with a calendar.
 */
export interface MyCalendar extends Calendar {
  myType: CalendarType;
  myGroupId: string;
}

/**
 * Associates the owner with calendar events
 */
export interface MyEvent extends Event {
  myType: CalendarType;
}

/**
 * Describes a range of time.
 */
export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Events indexed by a given day.
 */
export interface EventView {
  day: Date;
  allDay: MyEvent[];
  events: MyEvent[];
}

/**
 * Creates a new range for the next days
 */
export const nextDays = (days: number): DateRange => {
  const start = new Date();
  start.setHours(0, 0, 0);

  const end = new Date();
  end.setHours(23, 59, 59);
  end.setHours(end.getHours() + days * 24);

  return { start, end };
};

/**
 * Lists all events in the given datetime range
 */
export const getCalendarEvents = (client: HttpClient, range: DateRange, groupId?: string, calendarId?: string): Observable<Event[]> => {
  var endpoint = 'calendarView';
  if (groupId && calendarId) {
    endpoint = `calendarGroups/${groupId}/calendars/${calendarId}/calendarView`;
  }
  const params = new URLSearchParams();
  params.append('startDateTime', range.start.toISOString());
  params.append('endDateTime', range.end.toISOString());
  params.append('orderby', 'start/dateTime');

  const url = `${MY_GRAPH}/${endpoint}?${params.toString()}`;
  return client.get<GraphListResponse<any>>(url).pipe(map((data) => data.value as Event[]));
};

/**
 * List all calendars
 */
export const getCalendarGroups = (client: HttpClient): Observable<CalendarGroup[]> => {
  const endpoint = 'calendarGroups';
  const url = `${MY_GRAPH}/${endpoint}`;
  return client.get<GraphListResponse<any>>(url).pipe(map((data) => data.value as CalendarGroup[]));
};

/**
 * Returns a list of all calendars in the given group
 */
export const getCalendarGroupCalendars = (client: HttpClient, groupId: string): Observable<Calendar[]> => {
  const url = `${MY_GRAPH}/calendarGroups/${groupId}/calendars`;
  return client.get<GraphListResponse<any>>(url).pipe(map((data) => data.value as Calendar[]));
};

/**
 * Sorts events by start time
 */
export function sortByStartDate(a: MyEvent, b: MyEvent): number {
  if (a.start?.dateTime && b.start?.dateTime && a.end?.dateTime && b.end?.dateTime) {
    const dateA = new Date(a.start.dateTime);
    const dateB = new Date(b.start.dateTime);
    return dateA.getTime() - dateB.getTime();
  }
  return 0;
}
