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
import { AppComponent } from './app/app';
import { AppConfigService } from './app/feature-config/config.service';
import { OpenHABService } from './app/feature-openhab/openhab.service';
import { getGuardConfig, getInterceptorConfig } from './app/ms-graph/msal.config';
import { routes } from './app/routes';
import { AppConfig } from './app/feature-config/config.model';
import { firstValueFrom, tap } from 'rxjs';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAppInitializer(() => {
      console.log('----------------------------------------');
      console.log('Application starting....');
      console.log('----------------------------------------');
      registerLocaleData(localeDeAt);

      const openHab = inject(OpenHABService);
      openHab.init();

      const appService = inject(AppConfigService);
      const httpBackend = inject(HttpBackend);
      const httpClient = new HttpClient(httpBackend);
      return firstValueFrom(
        httpClient.get<AppConfig>('./config.json').pipe(
          tap((config) => {
            console.log('Configuration loaded successful.');
            appService.config.set(config);
          }),
        ),
      );
    }),
    provideRouter(routes),
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptorsFromDi(), withFetch()),
    {
      provide: MSAL_INSTANCE,
      deps: [AppConfigService],
      useFactory: (service: AppConfigService) => {
        const msalConfig = service.config().msalConfig;
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
