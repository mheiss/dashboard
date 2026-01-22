import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Calendar, CalendarGroup, DriveItem, Event, NullableOption, RemoteItem } from '@microsoft/microsoft-graph-types';
import { map, Observable } from 'rxjs';
import { AppConfigService } from '../feature-config/config.service';
import { DateRange } from './calendar.model';
import { GraphListResponse, logGraphListError } from './graph.model';

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

    const url = `${this.config.graph()}/me/${endpoint}?${params.toString()}`;
    return this.client.get<GraphListResponse<Event>>(url).pipe(map((data) => data.value));
  }

  /**
   * List all calendars
   */
  getCalendarGroups(): Observable<CalendarGroup[]> {
    const url = `${this.config.graph()}/me/calendarGroups`;
    return this.client.get<GraphListResponse<CalendarGroup>>(url).pipe(map((data) => data.value));
  }

  /**
   * Returns a list of all calendars in the given group
   */
  getCalendarGroupCalendars(groupId: string): Observable<Calendar[]> {
    const url = `${this.config.graph()}/me/calendarGroups/${groupId}/calendars`;
    return this.client.get<GraphListResponse<Calendar>>(url).pipe(map((data) => data.value));
  }

  /**
   * Returns the item with the given path.
   */
  getItem(path: string): Observable<DriveItem> {
    const url = `${this.config.graph()}/me/drive/root:/${path}`;
    return this.client.get<DriveItem>(url);
  }

  /**
   * Start to track changes to the given item and its children.
   */
  getChanges(item: DriveItem) {
    let itemId: NullableOption<string> | undefined = item.id;
    let driveId: NullableOption<string> | undefined = item.parentReference?.driveId;
    if (item.remoteItem) {
      itemId = item.remoteItem.id;
      driveId = item.remoteItem.parentReference?.driveId;
    }
    const url = `${this.config.graph()}/drives/${driveId}/items/${itemId}/delta`;
    return this.client.get<GraphListResponse<DriveItem>>(url).pipe(logGraphListError());
  }

  /**
   * Loads more images with the provided link
   */
  getNextChanges(nextLink: string) {
    return this.client.get<GraphListResponse<DriveItem>>(nextLink);
  }

  /**
   * Returns the thumbnail of a given item.
   */
  getThumbnailBlob(item: DriveItem): Observable<any> {
    const url = `${this.config.graph()}/me/drive/items/${item.id}/thumbnails/0/large/content`;
    return this.client.get(url, {
      responseType: 'blob',
    });
  }

  /**
   * Returns the original size of a given item.
   */
  getImageBlob = (item: DriveItem): Observable<any> => {
    const endpoint = `drive/items/${item.id}/content`;
    const url = `${this.config.graph()}/me/${endpoint}`;
    return this.client.get(url, {
      responseType: 'blob',
    });
  };
}
