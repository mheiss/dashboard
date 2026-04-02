import { registerLocaleData } from '@angular/common';
import { HTTP_INTERCEPTORS, HttpBackend, HttpClient, provideHttpClient, withFetch, withInterceptorsFromDi } from '@angular/common/http';
import localeDeAt from '@angular/common/locales/de-AT';
import { ApplicationConfig, inject, LOCALE_ID, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import {
  MSAL_GUARD_CONFIG,
  MSAL_INSTANCE,
  MSAL_INTERCEPTOR_CONFIG,
  MsalBroadcastService,
  MsalGuard,
  MsalInterceptor,
  MsalService,
} from '@azure/msal-angular';
import { PublicClientApplication } from '@azure/msal-browser';
import { firstValueFrom, switchMap, tap } from 'rxjs';
import { AppComponent } from './app/app';
import { AppConfig } from './app/feature-config/config.model';
import { AppConfigService } from './app/feature-config/config.service';
import { getAuthConfig, getGuardConfig, getInterceptorConfig } from './app/ms-graph/msal.config';
import { DebugService } from './app/utils/debug.service';
import { routes } from './app/routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAppInitializer(async () => {
      const debug = inject(DebugService);
      debug.log('----------------------------------------');
      debug.log('Application starting....');
      debug.log('----------------------------------------');
      registerLocaleData(localeDeAt);

      // Manually create a HTTP client to avoid that the MSAL interceptors
      // are created before loading the config
      const appService = inject(AppConfigService);
      const httpBackend = inject(HttpBackend);
      const httpClient = new HttpClient(httpBackend);

      const config = await firstValueFrom(httpClient.get<AppConfig>('./config/config.json'));
      appService.config.set(config);
      return Promise.resolve();
    }),
    provideRouter(routes),
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptorsFromDi(), withFetch()),
    {
      provide: MSAL_INSTANCE,
      deps: [AppConfigService],
      useFactory: (service: AppConfigService) => {
        const msalConfig = getAuthConfig(service.config().msalConfig);
        return new PublicClientApplication(msalConfig);
      },
    },
    {
      provide: MSAL_GUARD_CONFIG,
      deps: [AppConfigService],
      useFactory: (service: AppConfigService) => {
        const msalConfig = service.config().msalConfig;
        return getGuardConfig(msalConfig);
      },
    },
    {
      provide: MSAL_INTERCEPTOR_CONFIG,
      deps: [AppConfigService],
      useFactory: (service: AppConfigService) => {
        const appConfig = service.config();
        return getInterceptorConfig(appConfig);
      },
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: MsalInterceptor,
      multi: true,
    },
    {
      provide: LOCALE_ID,
      useValue: 'de-AT',
    },
    MsalService,
    MsalGuard,
    MsalBroadcastService,
  ],
};

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
