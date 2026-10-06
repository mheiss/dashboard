import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { timeout } from 'rxjs';
import { DebugService } from '../utils/debug.service';
import { Camera } from './protect.model';
import { loadMotionSnapshots, saveMotionSnapshot } from '../ms-graph/database';
import { groupMotionSnapshots, MAX_MOTION_GROUPS, MotionEventType, MotionSnapshot, StoredMotionSnapshot } from './motion.model';
export type { MotionSnapshot } from './motion.model';

@Injectable({ providedIn: 'root' })
export class MotionService {
  private readonly http = inject(HttpClient);
  private readonly debug = inject(DebugService);
  private readonly images = signal<MotionSnapshot[]>([]);

  readonly groups = computed(() => groupMotionSnapshots(this.images()));
  readonly snapshots = computed(() => this.groups().map((group) => group.preview));
  private pending = this.restore();

  capture(camera: Camera, type: MotionEventType = 'smart'): void {
    const id = crypto.randomUUID();
    const timestamp = Date.now();
    this.http
      .get('/api/webrtc/frame.jpeg', { params: { src: 'unifi_' + camera }, responseType: 'blob' })
      .pipe(timeout(10_000))
      .subscribe({
        next: (blob) => {
          const snapshot: StoredMotionSnapshot = { id, camera, timestamp, type, image: blob };
          this.pending = this.pending
            .then(() => this.addSnapshot(snapshot))
            .catch((error) => this.debug.log(`Motion snapshot could not be stored for '${camera}'.`, error));
        },
        error: (error) => this.debug.log(`Motion snapshot failed for '${camera}'.`, error),
      });
  }

  private async restore(): Promise<void> {
    try {
      const snapshots = await loadMotionSnapshots();
      this.publish(snapshots.map((snapshot) => this.toSnapshot(snapshot)));
    } catch (error) {
      this.debug.log('Motion snapshots could not be restored.', error);
    }
  }

  private async addSnapshot(snapshot: StoredMotionSnapshot): Promise<void> {
    this.publish([...this.images(), this.toSnapshot(snapshot)]);
    const oldestTimestamp = Math.min(...this.images().map((image) => image.timestamp.getTime()));
    await saveMotionSnapshot(snapshot, oldestTimestamp);
  }

  private toSnapshot(snapshot: StoredMotionSnapshot): MotionSnapshot {
    return { ...snapshot, timestamp: new Date(snapshot.timestamp), url: URL.createObjectURL(snapshot.image) };
  }

  private publish(snapshots: MotionSnapshot[]): void {
    const retained = groupMotionSnapshots(snapshots)
      .slice(0, MAX_MOTION_GROUPS)
      .flatMap((group) => group.snapshots);
    const ids = new Set(retained.map((snapshot) => snapshot.id));
    snapshots.filter((snapshot) => !ids.has(snapshot.id)).forEach((snapshot) => URL.revokeObjectURL(snapshot.url));
    this.images.set(retained);
  }
}
