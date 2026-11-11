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
  width: number | null;
  height: number | null;
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

export interface BackendMemoryDate {
  month: number;
  day: number;
  photoYearCount: number;
  photoCount: number;
}

export interface BackendMemoryDay {
  month: number;
  day: number;
  images: BackendImage[];
}

export interface DashboardChange {
  dataset: string;
  revision: number;
  timestamp: string;
}

export interface DashboardAction {
  type: 'SHOW_CAMERA' | 'SECURITY_STATE' | 'SNAPSHOTS_CHANGED' | 'SYNC';
  camera: string | null;
  armed: boolean | null;
}

export const IMAGE_FIELDS = 'id name takenAt modifiedAt thumbnailUrl originalUrl width height';
export const CALENDAR_FIELDS = 'id subject startsAt endsAt isAllDay calendar { id name theme }';

export const CALENDAR_THEMES: Record<string, string> = {
  emerald: 'calendar-color-emerald',
  rose: 'calendar-color-rose',
  sky: 'calendar-color-sky',
  amber: 'calendar-color-amber',
};
