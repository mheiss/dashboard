import { effect, signal, Signal } from '@angular/core';

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
export const entries = (): NavigationEntry[] => [
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
