import { Component, inject } from '@angular/core';
import { DashboardService } from '../dashboard/dashboard.service';
import { MatIcon } from "@angular/material/icon";

@Component({
  selector: 'app-navigation',
  imports: [MatIcon],
  templateUrl: './navigation.html',
})
export class Navigation {
  protected dashboard = inject(DashboardService);

}
