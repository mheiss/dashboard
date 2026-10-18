import { Component, inject, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Navigation } from './feature-navigation/navigation';
import { OpenHABService } from './feature-openhab/openhab.service';

@Component({
  selector: 'app-root',
  imports: [Navigation, RouterModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './app.html',
})
export class AppComponent implements OnInit {
  private readonly openHab = inject(OpenHABService);

  ngOnInit(): void {
    this.openHab.init();
  }
}
