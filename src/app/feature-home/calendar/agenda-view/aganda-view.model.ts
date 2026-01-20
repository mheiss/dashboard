/**
 * Event displayed in the agenda view.
 */
export interface AgendaEvent {
  id: string;
  subject: string;
  tailwindClasses: string;
  start: Date;
  end: Date;
  past: boolean;
}
