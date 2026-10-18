import { inject, Injectable, signal } from '@angular/core';
import { SessionService as SessionApiService } from './generated/services/session.service';
import { Session } from './generated/models/session';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly api = inject(SessionApiService);
  readonly session = signal<Session | null>(null);

  async load() {
    try {
      this.session.set(await this.api.getSession());
      return true;
    } catch {
      this.session.set(null);
      return false;
    }
  }

  async login(password: string) {
    this.session.set(await this.api.login({ body: { username: 'admin', password } }));
  }

  async logout() {
    await this.api.logout();
    this.session.set(null);
  }
}
