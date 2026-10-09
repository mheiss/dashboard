import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogRef } from '@angular/cdk/dialog';
import { CanActivateFn, Router } from '@angular/router';
import { LucideLogIn } from '@lucide/angular';
import { firstValueFrom } from 'rxjs';
import { SessionService } from '../backend/session.service';
import { Popup } from '../popup/popup';
import { PopupService } from '../popup/popup.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule, LucideLogIn, Popup],
  template: `
    <app-popup title="Einstellungen">
        <form (ngSubmit)="login()" class="grid gap-3 p-6 max-sm:p-4">
          <label for="password">Passwort</label>
          <input id="password" name="password" [(ngModel)]="password" type="password" autocomplete="current-password" required cdkFocusInitial
            class="w-full min-w-0 rounded-md border border-(--line) bg-(--surface) px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)" />
          @if (error()) { <p role="alert" class="text-sm text-[#a52b3d] wrap-anywhere">{{ error() }}</p> }
          <button type="submit" [disabled]="busy() || !password"
            class="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-(--accent) bg-(--accent) px-3.5 py-2.5 font-bold text-white disabled:cursor-default disabled:opacity-50">
            <svg lucideLogIn aria-hidden="true" class="size-5 shrink-0"></svg> Anmelden
          </button>
        </form>
    </app-popup>
  `,
})
export class Login {
  private readonly session = inject(SessionService);
  private readonly dialog = inject<DialogRef<string>>(DialogRef);
  password = '';
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  async login() {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.session.login(this.password);
      this.password = '';
      this.dialog.close('authenticated');
    } catch {
      this.error.set('Anmeldung fehlgeschlagen.');
    } finally {
      this.busy.set(false);
    }
  }
}

export const adminGuard: CanActivateFn = async () => {
  const session = inject(SessionService);
  const router = inject(Router);
  const popup = inject(PopupService);
  if (await session.load()) return session.session()?.admin || router.createUrlTree(['/home']);
  const result = await firstValueFrom(popup.open(Login, {
    disableClose: false,
    width: 'min(420px, calc(100vw - 32px))',
  }).closed);
  return (result === 'authenticated' && session.session()?.admin) || router.createUrlTree(['/home']);
};
