import { HttpInterceptorFn } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import Keycloak from 'keycloak-js';
import { from, switchMap } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly keycloak = new Keycloak({
    url: 'https://login.heiss.cloud',
    realm: 'cloud',
    clientId: 'dashboard',
  });
  readonly session = signal<{ username: string; admin: boolean } | null>(null);
  readonly error = signal<string | null>(null);
  private readonly initialized = this.initialize();

  private async initialize() {
    const location = new URL(window.location.href);
    const code = location.searchParams.get('microsoft_code');
    const state = location.searchParams.get('microsoft_state');
    if (code && state) {
      sessionStorage.setItem('dashboard.microsoft-connection', JSON.stringify({ code, state }));
      location.searchParams.delete('microsoft_code');
      location.searchParams.delete('microsoft_state');
      window.history.replaceState(null, '', location.href);
    }
    this.keycloak.onAuthLogout = () => this.session.set(null);
    this.keycloak.onAuthRefreshSuccess = () => this.updateSession();
    this.keycloak.onTokenExpired = () => void this.accessToken();
    try {
      await this.keycloak.init({
        onLoad: 'check-sso',
        pkceMethod: 'S256',
        checkLoginIframe: false,
        silentCheckSsoRedirectUri: new URL('silent-check-sso.html', document.baseURI).href,
        silentCheckSsoFallback: false,
        responseMode: 'query',
        redirectUri: new URL('auth/callback', document.baseURI).href,
      });
      this.updateSession();
    } catch {
      this.session.set(null);
      this.error.set('Anmeldung fehlgeschlagen. Bitte erneut anmelden.');
    }
    if (window.location.pathname === new URL('auth/callback', document.baseURI).pathname) {
      window.history.replaceState(null, '', new URL('setup', document.baseURI).href);
    }
  }

  private updateSession() {
    this.session.set(this.keycloak.authenticated ? {
      username: this.keycloak.tokenParsed?.['preferred_username'] ?? '',
      admin: this.keycloak.hasResourceRole('admin', 'dashboard'),
    } : null);
  }

  async load() {
    await this.initialized;
    await this.accessToken();
    return this.session() !== null;
  }

  async accessToken() {
    await this.initialized;
    if (!this.keycloak.authenticated) return undefined;
    try {
      await this.keycloak.updateToken(30);
      return this.keycloak.token;
    } catch {
      this.keycloak.clearToken();
      this.session.set(null);
      return undefined;
    }
  }

  async login() {
    await this.initialized;
    await this.keycloak.login({
      redirectUri: new URL('auth/callback', document.baseURI).href,
      prompt: this.keycloak.authenticated ? 'login' : undefined,
    });
  }

  async logout() {
    await this.initialized;
    this.session.set(null);
    await this.keycloak.logout({ redirectUri: new URL('home', document.baseURI).href });
  }
}

export const bearerInterceptor: HttpInterceptorFn = (request, next) => {
  const target = new URL(request.url, window.location.href);
  if (target.origin !== window.location.origin || !/^\/api\/(accounts|graphql)(\/|$)/.test(target.pathname)) {
    return next(request);
  }
  return from(inject(SessionService).accessToken()).pipe(switchMap(token => next(token
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request)));
};
