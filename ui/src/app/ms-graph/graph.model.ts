import { HttpErrorResponse } from '@angular/common/http';
import { DateTimeTimeZone, NullableOption } from '@microsoft/microsoft-graph-types';
import { catchError, of, OperatorFunction } from 'rxjs';
import { DebugService } from '../utils/debug.service';

/**
 * Basic result type returned by the GRAPH API.
 */
export interface GraphListResponse<T> {
  value: T[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
  '@app.error'?: HttpErrorResponse;
}

/**
 * A RXJS operator that catches HTTP errors during graph list request and returns an empty response with an error set.
 */
export function logGraphListError<T>(debug: DebugService): OperatorFunction<GraphListResponse<T>, GraphListResponse<T>> {
  return catchError((e) => {
    debug.log('Failed to query data.', e);
    const response: GraphListResponse<T> = { value: [], '@app.error': e };
    return of(response);
  });
}

/**
 * Converts a DateTimeTimeZone object to the local timezone.
 * Assumes that the API always returns UTC.
 */
export function graphToDate(timeWithZone: NullableOption<DateTimeTimeZone> | undefined): Date {
  if (!timeWithZone || !timeWithZone.dateTime || !timeWithZone.timeZone) {
    throw new Error('Undefined date or timezone');
  }

  const value = timeWithZone.dateTime;
  return new Date(/[zZ]$|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`);
}
