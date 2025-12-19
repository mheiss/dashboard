import { Routes } from '@angular/router';
import { Openhab } from './openhab/openhab';
import { Evcc } from './evcc/evcc';
import { Home } from './home/home';
import { Protect } from './protect/protect';

export const routes: Routes = [
  {
    path: '',
    component: Home,
  },
  {
    path: 'Home',
    component: Home,
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
