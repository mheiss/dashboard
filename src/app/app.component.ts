import { Component, inject } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { Dashboard } from './dashboard/dashboard';
import { Navigation } from './navigation/navigation';

@Component({
  selector: 'app-root',
  imports: [Navigation, Dashboard],
  templateUrl: './app.component.html',
})
export class AppComponent {
  private readonly matIconRegistry = inject(MatIconRegistry);
  private readonly domSanitizer = inject(DomSanitizer);

  constructor() {
    this.matIconRegistry.addSvgIcon('openhab.svg', this.domSanitizer.bypassSecurityTrustResourceUrl('assets/openhab.svg'));
    this.matIconRegistry.addSvgIcon('evcc.svg', this.domSanitizer.bypassSecurityTrustResourceUrl('assets/evcc.svg'));
  }
}
