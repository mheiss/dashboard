import { inject, Injectable, signal } from '@angular/core';
import { UiConfiguration } from '../backend/generated/models/ui-configuration';
import { ConfigurationService } from '../backend/generated/services/configuration.service';

@Injectable({ providedIn: 'root' })
export class AppConfigService {
  private readonly api = inject(ConfigurationService);
  private loaded?: Promise<UiConfiguration>;
  /**
   * The application configuration loaded at startup.
   */
  public readonly config = signal<UiConfiguration>({
    sitemapUrl: '', evccUrl: '', cameras: {}, keycloak: { url: '', realm: '', clientId: '' },
  });

  load() {
    return this.loaded ??= this.api.getConfiguration().then(config => {
      this.config.set(config);
      return config;
    });
  }
}
