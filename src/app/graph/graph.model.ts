import { config } from '../../config';

/**
 * The BASE Graph URL for the current authenticated user.
 */
export const MY_GRAPH = `${config.graphUrl}/me`;

/**
 * Basic result tye returned by the graph API.
 */
export interface GraphListResponse<T> {
  value: T;
  '@odata.nextLink'?: string;
}
