import { HTTP_INTERCEPTORS, provideHttpClient, withFetch, withInterceptorsFromDi } from '@angular/common/http';
import { ApplicationConfig, importProvidersFrom, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { MsalBroadcastService, MsalGuard, MsalInterceptor, MsalModule, MsalService } from '@azure/msal-angular';
import { PublicClientApplication } from '@azure/msal-browser';
import { AppComponent } from './app/app';
import { AUTH_CONFIG, GUARD_CONFIG, INTERCEPTOR_CONFIG } from './app/graph/msal.config';
import { OpenHABService } from './app/openhab/openhab.service';
import { routes } from './app/routes';
import { LOCALE_ID } from '@angular/core';
import localeDeAt from '@angular/common/locales/de-AT';
import { registerLocaleData } from '@angular/common';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAppInitializer(() => {
      registerLocaleData(localeDeAt);

      const msal = inject(MsalService);
      msal.handleRedirectObservable().subscribe();

      const api = inject(OpenHABService);
      api.startPingPong();

      return msal.initialize();
    }),
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptorsFromDi(), withFetch()),
    importProvidersFrom(MsalModule.forRoot(new PublicClientApplication(AUTH_CONFIG), GUARD_CONFIG, INTERCEPTOR_CONFIG)),
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
