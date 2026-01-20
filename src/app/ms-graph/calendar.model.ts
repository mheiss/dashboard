import { Calendar, Event } from '@microsoft/microsoft-graph-types';
import { CalendarConfig } from '../feature-config/config.model';

/**
 * Display type
 */
export type CalendarView = 'Day' | 'Agenda';
export function isCalendarView(view: any): view is CalendarView {
  return ['Day', 'Agenda'].indexOf(view) !== -1;
}

/**
 * Associates the type and the group with a calendar.
 */
export interface MyCalendar extends Calendar {
  /**
   * The configuration to use for this calendar
   */
  myConfig: CalendarConfig;
  /**
   * The group when this is a shared calendar
   */
  myGroupId: string;
}

/**
 * Associates the owner with calendar events
 */
export interface MyEvent extends Event {
  /**
   * The configuration to use for this event
   */
  myConfig: CalendarConfig;
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

/*
 * Returns the percentage of the day that has already passed.
 */
export function getPercentageOfDay() {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return (nowMinutes / (24 * 60)) * 100;
}

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
