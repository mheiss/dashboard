import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { PopupService } from '../popup/popup.service';
import { Calendar } from './calendar/calendar';
import { GalleryComponent } from './gallery/gallery';
import { Pin } from './pin/pin';
import { LayoutService } from '../utils/layout.service';
import { LoginPromptService } from '../feature-setup/login';

@Component({
  selector: 'app-home',
  templateUrl: './home.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [Calendar, GalleryComponent],
})
export class Home {
  private readonly login = inject(LoginPromptService);
  readonly dialog = inject(PopupService);
  readonly layout = inject(LayoutService);
  readonly routeData = toSignal(inject(ActivatedRoute).data, { requireSync: true });

  async openKeypad() {
    if (!(await this.login.requireAdmin())) return;
    this.dialog.open(Pin, {
      disableClose: true,
    });
  }
}
