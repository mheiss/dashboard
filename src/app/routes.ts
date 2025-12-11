import { Routes } from '@angular/router';
import { Openhab } from './openhab/openhab';
import { Evcc } from './evcc/evcc';
import { Home } from './home/home';

export const routes: Routes = [
  {
    path: 'home',
    component: Home,
  },
  {
    path: 'openhab',
    component: Openhab,
  },
  {
    path: 'evcc',
    component: Evcc,
  },
];
