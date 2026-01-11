import { CalendarType } from '../../../ms-graph/calendar.model';

/**
 * Event displayed in the agenda view.
 */
export interface AgendaEvent {
  id: string;
  subject: string;
  myType: CalendarType;
  start: Date;
  end: Date;
  past:boolean;
}
