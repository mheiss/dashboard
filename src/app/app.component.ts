import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Navigation } from './navigation/navigation';

@Component({
  selector: 'app-root',
  imports: [Navigation, RouterModule],
  templateUrl: './app.component.html',
})
export class AppComponent {}
