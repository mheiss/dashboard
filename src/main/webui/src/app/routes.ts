import { Routes } from '@angular/router';
import { MsalGuard } from '@azure/msal-angular';
import { Evcc } from './feature-evcc/evcc';
import { Home } from './feature-home/home';
import { Openhab } from './feature-openhab/openhab';
import { Protect } from './feature-protect/protect';

export const routes: Routes = [
  {
    path: 'home',
    component: Home,
    canActivate: [MsalGuard],
  },
  {
    path: 'calendar',
    component: Home,
    canActivate: [MsalGuard],
    data: { mobileView: 'calendar' },
  },
  {
    path: 'gallery',
    component: Home,
    canActivate: [MsalGuard],
    data: { mobileView: 'gallery' },
  },
  {
    path: 'openhab',
    component: Openhab,
  },
  {
    path: 'evcc',
    component: Evcc,
  },
  {
    path: 'protect',
    component: Protect,
  },
  {
    path: '**',
    redirectTo: '/home',
    pathMatch: 'full',
  },
];
