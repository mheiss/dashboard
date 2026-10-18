import { afterNextRender, Component, inject, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Navigation } from './feature-navigation/navigation';
import { OpenHABService } from './feature-openhab/openhab.service';
import { SessionService } from './backend/session.service';
import { LoginPromptService } from './feature-setup/login';

@Component({
  selector: 'app-root',
  imports: [Navigation, RouterModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './app.html',
})
export class AppComponent implements OnInit {
  private readonly openHab = inject(OpenHABService);

  constructor() {
    const session = inject(SessionService);
    const login = inject(LoginPromptService);
    afterNextRender(() => {
      if (!session.session()) void login.requireAdmin();
    });
  }

  ngOnInit(): void {
    this.openHab.init();
  }
}
