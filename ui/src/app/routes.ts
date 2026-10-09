import { Routes } from '@angular/router';
import { adminGuard } from './feature-setup/login';
import { Setup } from './feature-setup/setup';
import { Evcc } from './feature-evcc/evcc';
import { Home } from './feature-home/home';
import { Openhab } from './feature-openhab/openhab';
import { Protect } from './feature-protect/protect';

export const routes: Routes = [
  { path: 'login', redirectTo: '/setup', pathMatch: 'full' },
  { path: 'setup', component: Setup, canActivate: [adminGuard] },
  {
    path: 'home',
    component: Home,
  },
  {
    path: 'calendar',
    component: Home,
    data: { mobileView: 'calendar' },
  },
  {
    path: 'gallery',
    component: Home,
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
