import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NavigationEntry } from './navigation.model';

@Component({
  selector: 'app-navigation',
  templateUrl: './navigation.html',
  imports: [RouterModule],
})
export class Navigation {
  readonly elements: NavigationEntry[] = [
    { name: 'Home', icon: 'home.svg', path: '/home' },
    { name: 'OpenHAB', icon: 'openhab.svg', path: '/openhab' },
    { name: 'Wallbox', icon: 'evcc.svg', path: '/evcc' },
    { name: 'Kamera', icon: 'camera.svg', path: '/protect' },
  ];
}
