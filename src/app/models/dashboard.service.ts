import { Injectable, signal } from '@angular/core';
import { getEntries } from './dashboard.model';

@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  public entries = signal(getEntries());
}
