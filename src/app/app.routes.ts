import { Routes } from '@angular/router';
import { Openhab } from './openhab/openhab';
import { Evcc } from './evcc/evcc';

export const routes: Routes = [
  {
    path: 'openhab',
    component: Openhab,
  },
  {
    path: 'evcc',
    component: Evcc,
  },
];
