import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly http = inject(HttpClient);
  readonly session = signal<{ username: string; admin: boolean } | null>(null);

  async load() {
    try {
      this.session.set(await firstValueFrom(this.http.get<{ username: string; admin: boolean }>('/session')));
      return true;
    } catch {
      this.session.set(null);
      return false;
    }
  }

  async login(password: string) {
    const body = new URLSearchParams({ j_username: 'admin', j_password: password });
    await firstValueFrom(this.http.post('/j_security_check', body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Dashboard-Request': 'true' }, responseType: 'text',
    }));
    if (!(await this.load())) throw new Error('Sign-in failed');
  }

  async logout() {
    await firstValueFrom(this.http.post('/session/logout', {}, { headers: { 'X-Dashboard-Request': 'true' } }));
    this.session.set(null);
  }
}
