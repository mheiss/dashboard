import { DriveItem } from '@microsoft/microsoft-graph-types';
import { config } from '../../config';

/**
 * The BASE endpoint for the current authenticated user.
 */
export const MY_GRAPH = `${config.graphUrl}/me`;

/**
 * The QUERY endpoint
 */
export const MY_QUERY = `${config.graphUrl}/search/query`;

/**
 * Basic result type returned by the GRAPH API.
 */
export interface GraphListResponse<T> {
  value: T;
  '@odata.nextLink'?: string;
}

/**
 * Basic result type returned by the QUERY API.
 *
 * For each 'request' entry a single response is created.
 *
 * "requests": [
 *    { ... },
 *    { ... }
 *  ]
 *
 * So in the above use-case we would get two response entries.
 */
export interface GraphSearchResponse {
  value: SearchResponseEntry[];
}

/**
 * A response that corresponds to a search request
 */
export interface SearchResponseEntry {
  hitsContainers: SearchHitsContainer[];
}

/**
 * A container storing results per entity type.
 * Samples: driveItem, message
 */
export interface SearchHitsContainer {
  hits: SearchHit[];
}

/**
 * Represents a single search hit
 */
export interface SearchHit {
  resource: DriveItem;
}
