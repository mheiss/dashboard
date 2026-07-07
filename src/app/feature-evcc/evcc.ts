import { Component, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { AppConfigService } from '../feature-config/config.service';

@Component({
  selector: 'app-evcc',
  imports: [],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './evcc.html',
})
export class Evcc {
  private readonly config = inject(AppConfigService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly evccUrl = computed(() => this.sanitizer.bypassSecurityTrustResourceUrl(this.config.config().evcc.url));
}
