import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { LucideLogIn, LucideLogOut, LucideUser } from '@lucide/angular';
import { AppConfigService } from '../feature-config/config.service';
import { CameraPreferencesService } from '../feature-protect/camera-preferences.service';
import { Popup } from '../popup/popup';
import { ThemeService } from '../utils/theme.service';
import { SessionService } from '../backend/session.service';

@Component({
  selector: 'app-settings',
  imports: [Popup, LucideLogIn, LucideLogOut, LucideUser],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings.html',
})
export class Settings {
  readonly config = inject(AppConfigService);
  readonly preferences = inject(CameraPreferencesService);
  readonly theme = inject(ThemeService);
  readonly cameraIds = Object.keys(this.config.config().cameras);
  private readonly dialog = inject(DialogRef);
  private readonly router = inject(Router);

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

  async logout() {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.session.logout();
    } catch {
      this.error.set('Abmeldung fehlgeschlagen.');
    } finally {
      this.busy.set(false);
    }
  }

  openAccounts(): void {
    this.dialog.close();
    void this.router.navigate(['/setup']);
  }

  isAdmin(): boolean {
    return this.session.session()?.admin ?? false;
  }

  isUser(): boolean {
    return !this.isAdmin();
  }

  isAuthenticated(): boolean {
    return this.session.session() != null;
  }
}
