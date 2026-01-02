import { HttpClient } from '@angular/common/http';
import { DriveItem, Thumbnail, ThumbnailSet } from '@microsoft/microsoft-graph-types';
import { map, Observable } from 'rxjs';
import { GraphListResponse, MY_GRAPH } from './graph.model';

/**
 * A drive item with a thumbnail
 */
export interface ItemWithThumbnail {
  item: DriveItem;
  thumb: Thumbnail | null;
}

/**
 * List all images in the camera backup folder.
 */
export const getImages = (client: HttpClient, pageSize: number): Observable<GraphListResponse<DriveItem[]>> => {
  const endpoint = `drive/special/cameraroll/children`;

  const params = new URLSearchParams();
  params.append('$top', pageSize.toString());
  params.append('$orderby', 'lastModifiedDateTime desc');

  const url = `${MY_GRAPH}/${endpoint}?${params.toString()}`;
  return client.get<GraphListResponse<DriveItem[]>>(url);
};

/**
 * Loads more images with the provided link
 */
export const getNextImages = (client: HttpClient, nextLink: string) => {
  return client.get<GraphListResponse<DriveItem[]>>(nextLink);
};

/**
 * Returns the thumbnail for a given item.
 */
export const getThumbnail = (client: HttpClient, item: DriveItem): Observable<Thumbnail | null> => {
  const endpoint = `drive/items/${item.id}/thumbnails`;

  const url = `${MY_GRAPH}/${endpoint}`;
  return client.get<GraphListResponse<ThumbnailSet[]>>(url).pipe(
    map((response) => {
      const sets = response.value;
      const set = sets[0];
      if (set.medium) {
        return set.medium;
      }
      return null;
    }),
  );
};
