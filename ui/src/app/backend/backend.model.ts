export interface CalendarInfo {
  id: string;
  name: string;
  theme: string;
}

export interface CalendarEntry {
  id: string;
  subject: string;
  startsAt: string;
  endsAt: string;
  isAllDay: boolean;
  calendar: CalendarInfo;
}

export interface Agenda {
  revision: number;
  timezone: string;
  days: { date: string; allDay: CalendarEntry[]; events: CalendarEntry[] }[];
}

export interface BackendImage {
  id: string;
  name: string;
  takenAt: string | null;
  modifiedAt: string;
  thumbnailUrl: string;
  originalUrl: string;
}

export interface ImagePage {
  revision: number;
  totalCount: number;
  endCursor: string | null;
  hasNextPage: boolean;
  items: BackendImage[];
}

export interface BackendMoment {
  date: string;
  images: BackendImage[];
}

export interface DashboardChange {
  dataset: string;
  revision: number;
  timestamp: string;
}

export interface SourceView {
  id: string;
  kind: string;
  name: string;
  theme: string;
  selected: boolean;
}

export interface AccountView {
  id: string;
  name: string;
  status: string;
  error: string | null;
  lastSync: string | null;
  sources: SourceView[];
}

export const IMAGE_FIELDS = 'id name takenAt modifiedAt thumbnailUrl originalUrl';
export const CALENDAR_FIELDS = 'id subject startsAt endsAt isAllDay calendar { id name theme }';

export const CALENDAR_THEMES: Record<string, string> = {
  emerald: 'border-emerald-600 bg-emerald-300',
  rose: 'border-rose-600 bg-rose-300',
  sky: 'border-sky-600 bg-sky-200',
  amber: 'border-amber-600 bg-amber-200',
};
