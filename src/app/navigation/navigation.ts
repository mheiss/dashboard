import { Component, inject } from '@angular/core';
import { DashboardService } from '../dashboard/dashboard.service';
import { RouterLink, RouterLinkWithHref, RouterModule } from "@angular/router";

@Component({
  selector: 'app-navigation',
  templateUrl: './navigation.html',
  imports: [RouterModule],
})
export class Navigation {
  protected dashboard = inject(DashboardService);
}
