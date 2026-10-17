import { DestroyRef, inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { BackendService } from '../backend/backend.service';
import { DebugService } from '../utils/debug.service';
import { FullyService } from './fully.service';

@Injectable({ providedIn: 'root' })
export class OpenHABService {
  private readonly backend = inject(BackendService);
  private readonly fully = inject(FullyService);
  private readonly router = inject(Router);
  private readonly debug = inject(DebugService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly armed = new BehaviorSubject<boolean | null>(null);
  readonly armed$ = this.armed.asObservable();
  private initialized = false;
  private stateVersion = 0;

  init() {
    if (this.initialized) {
      return;
    }
    this.initialized = true;
    this.backend.actions.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((action) => {
      if (action.type === 'SHOW_CAMERA' && action.camera) {
        this.fully.turnScreenOn();
        void this.router.navigate(['/protect'], { queryParams: { camera: action.camera } });
      } else if (action.type === 'SECURITY_STATE') {
        this.stateVersion++;
        this.armed.next(action.armed);
      } else if (action.type === 'SYNC') {
        void this.refreshSecurity();
      }
    });
    this.backend.changed.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((change) => {
      if (change.dataset === 'ALL') void this.refreshSecurity();
    });
    void this.refreshSecurity();
  }

  async submitPin(pin: string): Promise<void> {
    await this.backend.query('mutation($pin: String!) { submitSecurityPin(pin: $pin) }', { pin });
  }

  private async refreshSecurity(): Promise<void> {
    const version = ++this.stateVersion;
    try {
      const result = await this.backend.query<{ securityArmed: boolean | null }>('{ securityArmed }');
      if (version === this.stateVersion) this.armed.next(result.securityArmed);
    } catch (error) {
      this.debug.log('Security status could not be loaded.', error);
    }
  }
}
