/**
 * All cameras in the system
 */
export type Camera = 'entry' | 'garden' | 'patio';
export function isCamera(type: any): type is Camera {
  return ['entry', 'garden', 'patio'].indexOf(type) !== -1;
}

/**
 * Supported video quality
 */
export type StreamQuality = 'high' | 'medium';
