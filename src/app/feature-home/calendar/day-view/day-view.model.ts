import { CalendarConfig } from '../../../feature-config/config.model';
import { MyEvent } from '../../../ms-graph/calendar.model';
import { graphToDate } from '../../../ms-graph/graph.model';
import { intersect, Rectangle } from '../../../utils/rectangle';

/**
 * Event with position displayed in the day view.
 */
export interface DayViewEvent {
  id: string;
  subject: string;
  tailwindClasses: string;
  position: Rectangle;
  slot: number;
}

/**
 * Converts the given event into a day-view event-
 */
export const convert = (event: MyEvent): DayViewEvent => {
  const id = event.id;
  const subject = event.subject;
  const position = toRectangle(event, 2, 96);
  const tailwindClasses = event.myConfig.tailwindClasses;
  const slot = 1;

  return { id, subject, tailwindClasses, position, slot } as DayViewEvent;
};

/**
 * Returns a rectangle using the given start and end dates.
 * The y and the height represent the percentage of the day that has already passed.
 */
export function toRectangle(event: MyEvent, x: number, width: number): Rectangle {
  const start = graphToDate(event.start);
  const end = graphToDate(event.end);

  // Shorten the event by a bit to have spacing in between
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes() - 2;

  // Convert in percentage of the day
  const height = ((endMinutes - startMinutes) / (24 * 60)) * 100;
  const y = (startMinutes / (24 * 60)) * 100;
  return { x, y, width, height };
}

/**
 * Adjust the position of all events so that they do not overlap
 */
export const alignPosition = (events: DayViewEvent[]) => {
  // Process each event. Move it into the next slot until there are no
  // more conflicts
  const positioned: DayViewEvent[] = [];
  for (const event of events) {
    positioned.push(event);

    // We keep the current slot unless it is already taken
    while (intersection(event, positioned).length != 0) {
      event.slot = event.slot + 1;
      event.position.x = event.position.width * event.slot;
    }
  }
};

export const intersection = (next: DayViewEvent, all: DayViewEvent[]) => {
  return all.filter((e) => e != next && intersect(next.position, e.position));
};
