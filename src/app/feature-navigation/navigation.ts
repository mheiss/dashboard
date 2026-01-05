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
    { name: 'Home', icon: 'home.svg', path: 'Home' },
    { name: 'OpenHAB', icon: 'openhab.svg', path: 'OpenHAB' },
    { name: 'Wallbox', icon: 'evcc.svg', path: 'EVCC' },
    { name: 'Kamera', icon: 'camera.svg', path: 'Protect' },
  ];
}
