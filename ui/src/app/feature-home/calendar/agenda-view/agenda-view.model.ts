/**
 * Event displayed in the agenda view.
 */
export interface AgendaEvent {
  id: string;
  subject: string;
  start: Date;
  end: Date;
  tailwindClasses: string;
}
