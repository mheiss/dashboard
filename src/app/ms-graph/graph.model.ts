import { DateTimeTimeZone, NullableOption } from '@microsoft/microsoft-graph-types';

/**
 * Basic result type returned by the GRAPH API.
 */
export interface GraphListResponse<T> {
  value: T;
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
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
