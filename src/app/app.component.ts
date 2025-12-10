import { Component } from '@angular/core';
import { Dashboard } from './dashboard/dashboard';
import { Navigation } from './navigation/navigation';

@Component({
  selector: 'app-root',
  imports: [Navigation, Dashboard],
  templateUrl: './app.component.html',
})
export class AppComponent {
}
