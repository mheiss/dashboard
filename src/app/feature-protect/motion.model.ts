import { Camera } from './protect.model';

/**
 * The time window (in milliseconds) within which motion snapshots are considered part of the same group.
 */
export const MOTION_WINDOW = 30_000;

/**
 * The maximum number of motion groups to retain.
 */
export const MAX_MOTION_GROUPS = 20;

/**
 * Represents the type of motion event, either a regular motion event or a smart motion event.
 */
export type MotionEventType = 'motion' | 'smart';

/**
 * Represents a stored motion snapshot with a timestamp as a number.
 */
export interface StoredMotionSnapshot {
  id: string;
  camera: Camera;
  timestamp: number;
  type: MotionEventType;
  image: Blob;
}

/**
 * Represents a motion snapshot with a URL and a Date object for the timestamp.
 */
export interface MotionSnapshot extends Omit<StoredMotionSnapshot, 'timestamp'> {
  timestamp: Date;
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

/**
 * Groups motion snapshots into clusters based on their timestamps and the defined motion window.
 *
 * @param snapshots The list of motion snapshots to be grouped.
 * @returns An array of motion groups, each containing snapshots that occurred within the defined motion window.
 */
export function groupMotionSnapshots(snapshots: readonly MotionSnapshot[]): MotionGroup[] {
  const sorted = [...snapshots].sort(
    (first, second) => first.timestamp.getTime() - second.timestamp.getTime() || first.id.localeCompare(second.id),
  );
  const groups: MotionGroup[] = [];
  for (const snapshot of sorted) {
    const group = groups[groups.length - 1];
    if (!group || snapshot.timestamp.getTime() - group.snapshots[0].timestamp.getTime() >= MOTION_WINDOW) {
      groups.push({ id: snapshot.id, snapshots: [snapshot], preview: snapshot });
      continue;
    }
    group.snapshots.push(snapshot);
    if (snapshot.type === 'smart' || group.preview.type !== 'smart') {
      group.preview = snapshot;
    }
  }
  return groups.reverse();
}
