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

/**
 * A camera that can be played or not.
 */
export interface PlayableCamera {
  camera: Camera;
  play: boolean;
}

/**
 * Delay in milliseconds between starting each camera stream to avoid overwhelming the system.
 */
export const PLAY_DELAY = 50;
