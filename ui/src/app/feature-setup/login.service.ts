import { inject, Injectable } from '@angular/core';
import { SessionService } from '../backend/session.service';
import { PopupService } from '../popup/popup.service';
import { firstValueFrom } from 'rxjs';
import { CanActivateFn, Router } from '@angular/router';
import { Setup } from './setup';

@Injectable({ providedIn: 'root' })
export class LoginPromptService {
  private readonly session = inject(SessionService);
  private readonly popup = inject(PopupService);
  private pending?: Promise<boolean>;

  async requireAdmin(): Promise<boolean> {
    if ((await this.session.load()) && this.session.session()?.admin) return true;
    this.pending ??= firstValueFrom(
      this.popup.open(Setup, {
        disableClose: false,
        width: 'min(420px, calc(100vw - 32px))',
      }).closed,
    )
      .then(() => this.session.session()?.admin ?? false)
      .finally(() => {
        this.pending = undefined;
      });
    return this.pending;
  }
}

export const adminGuard: CanActivateFn = async () => {
  const login = inject(LoginPromptService);
  const router = inject(Router);
  return (await login.requireAdmin()) || router.createUrlTree(['/home']);
};
