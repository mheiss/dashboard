/**
 * Basic result tye returned by the graph API.
 */
interface GraphListResponse<T> {
  value: T;
  '@odata.nextLink'?: string;
}
