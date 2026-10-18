import { computed, effect, inject, Signal, signal } from '@angular/core';
import { AppConfigService } from '../feature-config/config.service';
import { LayoutService } from '../utils/layout.service';

export interface NavigationIcons {
  normal: string;
  active: string;
  hover: string;
}

/**
 * A main navigation route
 */
export class NavigationEntry {
  constructor(
    public name: string,
    public path: string,
    protected icons?: NavigationIcons,
  ) {
    if (!icons) {
      return;
    }
    this.icon.set(icons.normal);
    effect(() => {
      if (this.hover()) {
        this.icon.set(icons.hover);
      } else if (this.active()) {
        this.icon.set(icons.active);
      } else {
        this.icon.set(icons.normal);
      }
    });
  }

  readonly icon = signal<string>('');
  readonly active = signal<boolean>(false);
  readonly hover = signal<boolean>(false);
}

/**
 * The navigation entries
 */
export const entries = (): Signal<NavigationEntry[]> => {
  const appConfig = inject(AppConfigService);
  const layout = inject(LayoutService);
  const allEntries = [
    new NavigationEntry('Home', '/home', {
      normal: 'assets/home.svg',
      active: 'assets/home_active.svg',
      hover: 'assets/home_hover.svg',
    }),
    new NavigationEntry('Kalender', '/calendar'),
    new NavigationEntry('Galerie', '/gallery'),
    new NavigationEntry('OpenHAB', '/openhab', {
      normal: 'assets/openhab.svg',
      active: 'assets/openhab.svg',
      hover: 'assets/openhab.svg',
    }),
    new NavigationEntry('Wallbox', '/evcc', {
      normal: 'assets/evcc.svg',
      active: 'assets/evcc.svg',
      hover: 'assets/evcc.svg',
    }),
    new NavigationEntry('Kamera', '/protect', {
      normal: 'assets/camera.svg',
      active: 'assets/camera_active.svg',
      hover: 'assets/camera_hover.svg',
    }),
  ];

  return computed(() =>
    allEntries.filter((entry) => {
      if (entry.path === '/openhab' && !appConfig.config().sitemapUrl.trim()) {
        return false;
      }
      if (entry.path === '/evcc' && !appConfig.config().evccUrl.trim()) {
        return false;
      }
      if (entry.path === '/protect' && Object.keys(appConfig.config().cameras).length === 0) {
        return false;
      }
      return layout.mobile$() ? entry.path !== '/home' : entry.path !== '/calendar' && entry.path !== '/gallery';
    }),
  );
};
