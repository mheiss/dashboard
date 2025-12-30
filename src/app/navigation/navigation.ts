import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Path } from '../models/dashboard.model';

export class NavigationEntry {
  name: string;
  icon: string;
  path: Path;
}

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
