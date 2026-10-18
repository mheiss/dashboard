import { Injectable, signal } from '@angular/core';
import { UiConfiguration } from '../backend/generated/models/ui-configuration';

@Injectable({ providedIn: 'root' })
export class AppConfigService {
  /**
   * The application configuration loaded at startup.
   */
  public readonly config = signal<UiConfiguration>({ sitemapUrl: '', evccUrl: '', cameras: {} });
}
