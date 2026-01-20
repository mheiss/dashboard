import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
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
  myGraph() {
    return `${this.config().graphUrl}/me`;
  }
}
