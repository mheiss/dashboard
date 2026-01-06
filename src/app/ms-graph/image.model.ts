import { HttpClient } from '@angular/common/http';
import { DriveItem, Thumbnail, ThumbnailSet } from '@microsoft/microsoft-graph-types';
import { map, Observable } from 'rxjs';
import { GraphListResponse, MY_GRAPH } from './graph.model';

/**
 * The image stored in the local database
 */
export interface DriveImage {
  id: string;
  name: string;
  takenAt: number;
  lastModifiedAt: number;
  thumbnailBlob?: Blob;
}

/**
 * A drive image with a thumbnail
 */
export interface ImageWithThumbnail {
  image: DriveImage;
  thumbnail$: Observable<string | null>;
}

/**
 * List all images in the camera backup folder.
 */
export const getImages = (client: HttpClient): Observable<GraphListResponse<DriveItem[]>> => {
  const endpoint = `drive/special/cameraroll/delta`;

  const url = `${MY_GRAPH}/${endpoint}`;
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
export const getThumbnail = (client: HttpClient, item: DriveItem): Observable<any> => {
  const endpoint = `drive/items/${item.id}/thumbnails/0/large/content`;

  const url = `${MY_GRAPH}/${endpoint}`;
  return client.get(url, {
    responseType: 'blob',
  });
};
