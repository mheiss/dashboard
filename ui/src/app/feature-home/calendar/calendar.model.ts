import { Event } from '@microsoft/microsoft-graph-types';
import { CalendarConfig } from '../../feature-config/config.model';

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
 * Events indexed by a given day.
 */
export interface EventView {
  day: Date;
  allDay: MyEvent[];
  events: MyEvent[];
}
