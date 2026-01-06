import { HttpClient } from '@angular/common/http';
import { DriveItem } from '@microsoft/microsoft-graph-types';
import { Observable } from 'rxjs';
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
 * A drive image with a thumbnail and the original size
 */
export interface DriveImageExt {
  image: DriveImage;
  original$: Observable<Blob | null>;
  thumbnail$: Observable<Blob | null>;
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
 * Returns the thumbnail of a given item.
 */
export const getThumbnailBlob = (client: HttpClient, item: DriveItem): Observable<any> => {
  const endpoint = `drive/items/${item.id}/thumbnails/0/large/content`;

  const url = `${MY_GRAPH}/${endpoint}`;
  return client.get(url, {
    responseType: 'blob',
  });
};

/**
 * Returns the original size of a given item.
 */
export const getImageBlob = (client: HttpClient, item: DriveItem): Observable<any> => {
  const endpoint = `drive/items/${item.id}/content`;

  const url = `${MY_GRAPH}/${endpoint}`;
  return client.get(url, {
    responseType: 'blob',
  });
};
