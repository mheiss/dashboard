import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
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
    { name: 'Home', icon: 'home', path: 'Home' },
    { name: 'OpenHAB', icon: 'openhab.svg', path: 'OpenHAB' },
    { name: 'Wallbox', icon: 'evcc.svg', path: 'EVCC' },
    { name: 'Kamera', icon: 'security', path: 'Protect' },
  ];
}
