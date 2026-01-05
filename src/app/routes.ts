import { Routes } from '@angular/router';
import { MsalGuard } from '@azure/msal-angular';
import { Evcc } from './feature-evcc/evcc';
import { Home } from './feature-home/home';
import { Openhab } from './feature-openhab/openhab';
import { Protect } from './feature-protect/protect';

export const routes: Routes = [
  {
    path: 'Home',
    component: Home,
    canActivate: [MsalGuard],
  },
  {
    path: 'OpenHAB',
    component: Openhab,
  },
  {
    path: 'EVCC',
    component: Evcc,
  },
  {
    path: 'Protect',
    component: Protect,
  },
  {
    path: '**',
    redirectTo: '/Home',
    pathMatch: 'full',
  },
];
