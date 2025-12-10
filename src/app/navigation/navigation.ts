import { Component, inject } from '@angular/core';
import { DashboardService } from '../dashboard/dashboard.service';

@Component({
  selector: 'app-navigation',
  templateUrl: './navigation.html',
})
export class Navigation {
  protected dashboard = inject(DashboardService);
}
