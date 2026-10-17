import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BackendService } from '../backend/backend.service';
import { DebugService } from '../utils/debug.service';
import { MotionGroup, MotionSnapshot } from './motion.model';
export type { MotionSnapshot } from './motion.model';

type BackendSnapshot = Omit<MotionSnapshot, 'timestamp'> & { timestamp: number | string };
type BackendGroup = Omit<MotionGroup, 'snapshots' | 'preview'> & { snapshots: BackendSnapshot[]; preview: BackendSnapshot };
const SNAPSHOT_FIELDS = 'id camera timestamp type url';

@Injectable({ providedIn: 'root' })
export class MotionService {
  private readonly backend = inject(BackendService);
  private readonly debug = inject(DebugService);
  private readonly groupState = signal<MotionGroup[]>([]);
  readonly groups = this.groupState.asReadonly();
  readonly snapshots = computed(() => this.groups().map((group) => group.preview));
  private version = 0;

  constructor() {
    const destroyRef = inject(DestroyRef);
    this.backend.actions.pipe(takeUntilDestroyed(destroyRef)).subscribe((action) => {
      if (action.type === 'SNAPSHOTS_CHANGED' || action.type === 'SYNC') void this.refresh();
    });
    this.backend.changed.pipe(takeUntilDestroyed(destroyRef)).subscribe((change) => {
      if (change.dataset === 'ALL') void this.refresh();
    });
    void this.refresh();
  }

  private async refresh(): Promise<void> {
    const version = ++this.version;
    try {
      const result = await this.backend.query<{ motionGroups: BackendGroup[] }>(
        `{ motionGroups { id snapshots { ${SNAPSHOT_FIELDS} } preview { ${SNAPSHOT_FIELDS} } } }`,
      );
      if (version === this.version) {
        this.groupState.set(
          result.motionGroups.map((group) => ({
            ...group,
            snapshots: group.snapshots.map((snapshot) => this.toSnapshot(snapshot)),
            preview: this.toSnapshot(group.preview),
          })),
        );
      }
    } catch (error) {
      this.debug.log('Motion snapshots could not be loaded.', error);
    }
  }

  private toSnapshot(snapshot: BackendSnapshot): MotionSnapshot {
    return { ...snapshot, timestamp: new Date(Number(snapshot.timestamp)) };
  }
}
