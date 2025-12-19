import { Component, inject } from '@angular/core';
import { OpenHABApi } from '../openhab/openhab.service';

@Component({
  selector: 'app-home',
  imports: [],
  templateUrl: './home.html',
})
export class Home {
  readonly openHabApi = inject(OpenHABApi);
}
