import { Routes } from '@angular/router';
import { Openhab } from './openhab/openhab';
import { Evcc } from './evcc/evcc';
import { Home } from './home/home';
import { Protect } from './protect/protect';
import { MsalGuard } from '@azure/msal-angular';

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
];
