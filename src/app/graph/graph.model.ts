import { DateTimeTimeZone, DriveItem, NullableOption } from '@microsoft/microsoft-graph-types';
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

/**
 * Converts a DateTimeTimeZone object to the local timezone.
 * Assumes that the API always returns UTC.
 */
export function graphToDate(timeWithZone: NullableOption<DateTimeTimeZone> | undefined): Date {
  if (!timeWithZone || !timeWithZone.dateTime || !timeWithZone.timeZone) {
    throw new Error('Undefined date or timezone');
  }

  //  Parse the dateTime into different objects
  const [datePart, timePart] = timeWithZone.dateTime.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute, second] = timePart.split(':').map(Number);

  // Create a temporary date in local timezone
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}
