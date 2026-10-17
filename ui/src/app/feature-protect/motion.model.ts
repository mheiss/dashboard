import { Camera } from './protect.model';

/**
 * Represents the type of motion event, either a regular motion event or a smart motion event.
 */
export type MotionEventType = 'motion' | 'smart';

/**
 * Represents a motion snapshot with a URL and a Date object for the timestamp.
 */
export interface MotionSnapshot {
  id: string;
  camera: Camera;
  timestamp: Date;
  type: MotionEventType;
  url: string;
}

/**
 * Represents a group of motion snapshots that occurred within a short time window.
 */
export interface MotionGroup {
  id: string;
  snapshots: MotionSnapshot[];
  preview: MotionSnapshot;
}
