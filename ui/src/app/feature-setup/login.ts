import { Component, inject, Injectable, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { LucideLogIn } from '@lucide/angular';
import { firstValueFrom } from 'rxjs';
import { SessionService } from '../backend/session.service';
import { Popup } from '../popup/popup';
import { PopupService } from '../popup/popup.service';

@Component({
  selector: 'app-login',
  imports: [LucideLogIn, Popup],
  template: `
    <app-popup title="Einstellungen">
        <div class="grid gap-3 p-6 max-sm:p-4">
          @if (session.session() && !session.session()?.admin) {
            <p role="alert">Keine Administratorberechtigung.</p>
          }
          @if (error()) { <p role="alert" class="text-sm text-[#a52b3d] wrap-anywhere">{{ error() }}</p> }
          <button type="button" (click)="login()" [disabled]="busy()"
            class="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-(--accent) bg-(--accent) px-3.5 py-2.5 font-bold text-white disabled:cursor-default disabled:opacity-50">
            <svg lucideLogIn aria-hidden="true" class="size-5 shrink-0"></svg> Mit Keycloak anmelden
          </button>
        </div>
    </app-popup>
  `,
})
export class Login {
  readonly session = inject(SessionService);
  readonly busy = signal(false);
  readonly error = signal<string | null>(this.session.error());

  async login() {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.session.login();
    } catch {
      this.error.set('Anmeldung fehlgeschlagen.');
    } finally {
      this.busy.set(false);
    }
  }
}

@Injectable({ providedIn: 'root' })
export class LoginPromptService {
  private readonly session = inject(SessionService);
  private readonly popup = inject(PopupService);
  private pending?: Promise<boolean>;

  async requireAdmin(): Promise<boolean> {
    if (await this.session.load() && this.session.session()?.admin) return true;
    this.pending ??= firstValueFrom(this.popup.open(Login, {
      disableClose: false,
      width: 'min(420px, calc(100vw - 32px))',
    }).closed).then(() => this.session.session()?.admin ?? false).finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }
}

export const adminGuard: CanActivateFn = async () => {
  const login = inject(LoginPromptService);
  const router = inject(Router);
  return await login.requireAdmin() || router.createUrlTree(['/home']);
};
