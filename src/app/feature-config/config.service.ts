import { Injectable, signal } from '@angular/core';
import { AppConfig } from './config.model';

@Injectable({ providedIn: 'root' })
export class AppConfigService {
  /**
   * The application configuration loaded at startup.
   */
  public readonly config = signal<AppConfig>({} as AppConfig);

  /**
   * The BASE endpoint for the current authenticated user.
   */
  graph() {
    return `${this.config().graphUrl}`;
  }
}
