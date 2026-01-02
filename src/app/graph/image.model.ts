import { HttpClient } from '@angular/common/http';
import { DriveItem, Thumbnail } from '@microsoft/microsoft-graph-types';
import { filter, map, Observable } from 'rxjs';
import { GraphListResponse, MY_GRAPH } from './graph.model';

/**
 * A drive item with a thumbnail
 */
export interface ItemWithThumbnail {
  item: DriveItem;
  thumb?: Thumbnail;
}

/**
 * List all images in the camera backup folder.
 */
export const getImages = (client: HttpClient, pageSize: number): Observable<GraphListResponse<DriveItem[]>> => {
  const endpoint = `drive/special/cameraroll/search(q='jpg')`;

  const params = new URLSearchParams();
  params.append('$top', pageSize.toString());
  params.append('$expand', 'thumbnails');
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
