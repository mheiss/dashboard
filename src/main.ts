import { bootstrapApplication } from '@angular/platform-browser';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app/routes';
import { AppComponent } from './app/app';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { OpenHABApi } from './app/openhab/openhab.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAppInitializer(() => {
      const api = inject(OpenHABApi);
      api.startPingPong();
    }),
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withFetch()),
  ],
};

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
