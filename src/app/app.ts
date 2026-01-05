import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Navigation } from './feature-navigation/navigation';

@Component({
  selector: 'app-root',
  imports: [Navigation, RouterModule],
  templateUrl: './app.html',
})
export class AppComponent {}
