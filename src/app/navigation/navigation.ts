import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { DashboardService } from '../models/dashboard.service';

@Component({
  selector: 'app-navigation',
  templateUrl: './navigation.html',
  imports: [RouterModule],
})
export class Navigation {
  protected dashboard = inject(DashboardService);
}
