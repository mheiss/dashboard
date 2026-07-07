import { Component, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { AppConfigService } from '../feature-config/config.service';

@Component({
  selector: 'app-openhab',
  imports: [],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './openhab.html',
})
export class Openhab {
  private readonly config = inject(AppConfigService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly sitemapUrl = computed(() => this.sanitizer.bypassSecurityTrustResourceUrl(this.config.config().openhab.sitemap));
}
