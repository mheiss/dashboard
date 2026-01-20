import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Calendar, Event, CalendarGroup, DriveItem } from '@microsoft/microsoft-graph-types';
import { map, Observable } from 'rxjs';
import { AppConfigService } from '../feature-config/config.service';
import { DateRange } from './calendar.model';
import { GraphListResponse } from './graph.model';

@Injectable({ providedIn: 'root' })
export class GraphRestService {
  private readonly client = inject(HttpClient);
  private readonly config = inject(AppConfigService);

  /**
   * Lists all events in the given datetime range
   */
  getCalendarEvents(range: DateRange, groupId?: string, calendarId?: string): Observable<Event[]> {
    var endpoint = 'calendarView';
    if (groupId && calendarId) {
      endpoint = `calendarGroups/${groupId}/calendars/${calendarId}/calendarView`;
    }
    const params = new URLSearchParams();
    params.append('startDateTime', range.start.toISOString());
    params.append('endDateTime', range.end.toISOString());
    params.append('orderby', 'start/dateTime');

    const url = `${this.config.myGraph()}/${endpoint}?${params.toString()}`;
    return this.client.get<GraphListResponse<Event[]>>(url).pipe(map((data) => data.value));
  }

  /**
   * List all calendars
   */
  getCalendarGroups(): Observable<CalendarGroup[]> {
    const endpoint = 'calendarGroups';
    const url = `${this.config.myGraph()}/${endpoint}`;
    return this.client.get<GraphListResponse<CalendarGroup[]>>(url).pipe(map((data) => data.value));
  }

  /**
   * Returns a list of all calendars in the given group
   */
  getCalendarGroupCalendars(groupId: string): Observable<Calendar[]> {
    const url = `${this.config.myGraph()}/calendarGroups/${groupId}/calendars`;
    return this.client.get<GraphListResponse<Calendar[]>>(url).pipe(map((data) => data.value));
  }

  /**
   * List all images in the camera backup folder.
   */
  getImages(): Observable<GraphListResponse<DriveItem[]>> {
    const endpoint = `drive/special/cameraroll/delta`;

    const url = `${this.config.myGraph()}/${endpoint}`;
    return this.client.get<GraphListResponse<DriveItem[]>>(url);
  }

  /**
   * Loads more images with the provided link
   */
  getNextImages(nextLink: string) {
    return this.client.get<GraphListResponse<DriveItem[]>>(nextLink);
  }

  /**
   * Returns the thumbnail of a given item.
   */
  getThumbnailBlob(item: DriveItem): Observable<any> {
    const endpoint = `drive/items/${item.id}/thumbnails/0/large/content`;
    const url = `${this.config.myGraph()}/${endpoint}`;
    return this.client.get(url, {
      responseType: 'blob',
    });
  }

  /**
   * Returns the original size of a given item.
   */
  getImageBlob = (item: DriveItem): Observable<any> => {
    const endpoint = `drive/items/${item.id}/content`;
    const url = `${this.config.myGraph()}/${endpoint}`;
    return this.client.get(url, {
      responseType: 'blob',
    });
  };
}
