import { registerLocaleData } from '@angular/common';
import { HttpClient, provideHttpClient, withFetch } from '@angular/common/http';
import localeDeAt from '@angular/common/locales/de-AT';
import { ApplicationConfig, inject, LOCALE_ID, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AppComponent } from './app/app';
import { AppConfig } from './app/feature-config/config.model';
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
      const httpClient = inject(HttpClient);

      const config = await firstValueFrom(httpClient.get<AppConfig>('/config'));
      appService.config.set(config);
      return Promise.resolve();
    }),
    provideRouter(routes),
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch()),
    {
      provide: LOCALE_ID,
      useValue: 'de-AT',
    },
  ],
};

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
