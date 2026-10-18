import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import localeDeAt from '@angular/common/locales/de-AT';
import { ApplicationConfig, inject, LOCALE_ID, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app/app';
import { ConfigurationService } from './app/backend/generated/services/configuration.service';
import { provideApiConfiguration } from './app/backend/generated/api-configuration';
import { bearerInterceptor, SessionService } from './app/backend/session.service';
import { AppConfigService } from './app/feature-config/config.service';
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

      const appService = inject(AppConfigService);
      const api = inject(ConfigurationService);
      const session = inject(SessionService);

      await session.load();
      const config = await api.getConfiguration();
      appService.config.set(config);
      return Promise.resolve();
    }),
    provideRouter(routes),
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch(), withInterceptors([bearerInterceptor])),
    provideApiConfiguration(''),
    {
      provide: LOCALE_ID,
      useValue: 'de-AT',
    },
  ],
};

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
