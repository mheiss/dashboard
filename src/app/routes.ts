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
  {
    path: 'protect',
    component: Protect,
  },
];
