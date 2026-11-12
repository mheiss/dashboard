import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AppConfigService } from '../feature-config/config.service';
import { CameraPreferencesService } from '../feature-protect/camera-preferences.service';
import { Popup } from '../popup/popup';
import { ThemeService } from '../utils/theme.service';

@Component({
  selector: 'app-settings',
  imports: [Popup],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-popup title="Einstellungen">
      <div class="grid gap-6 p-6 max-sm:p-4">
        <section>
          <h3 class="mb-2 font-semibold">Design</h3>
          <button type="button" class="rounded-md border border-(--line) px-3 py-2" (click)="theme.toggle()">
            {{ theme.isDark() ? 'Zum hellen Design wechseln' : 'Zum dunklen Design wechseln' }}
          </button>
        </section>
        @if (cameraIds.length) {
          <fieldset>
            <legend class="mb-2 font-semibold">Kameras auf diesem Gerät anzeigen</legend>
            <div class="grid gap-2">
              @for (camera of cameraIds; track camera) {
                <label class="flex items-center gap-2">
                  <input
                    #cameraVisibility
                    type="checkbox"
                    [checked]="!preferences.hiddenCameras().includes(camera)"
                    (change)="preferences.setVisible(camera, cameraVisibility.checked)"
                  />
                  {{ config.config().cameras[camera] }}
                </label>
              }
            </div>
          </fieldset>
        }
        @if (preferences.storageError(); as error) {
          <p role="alert" class="text-sm text-[#a52b3d]">{{ error }}</p>
        }
        <section>
          <h3 class="mb-2 font-semibold">Konten</h3>
          <button type="button" class="rounded-md border border-(--line) px-3 py-2" (click)="openAccounts()">Konten verwalten</button>
        </section>
      </div>
    </app-popup>
  `,
})
export class Settings {
  readonly config = inject(AppConfigService);
  readonly preferences = inject(CameraPreferencesService);
  readonly theme = inject(ThemeService);
  readonly cameraIds = Object.keys(this.config.config().cameras);
  private readonly dialog = inject(DialogRef);
  private readonly router = inject(Router);

  openAccounts(): void {
    this.dialog.close();
    void this.router.navigate(['/setup']);
  }
}
