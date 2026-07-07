/**
 * All cameras in the system
 */
export type Camera = string;
export function isCamera(type: string | null, cameras: readonly Camera[]): type is Camera {
  return type !== null && cameras.includes(type);
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
