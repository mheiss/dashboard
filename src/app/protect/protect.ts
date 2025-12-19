import { Component, inject, signal } from '@angular/core';
import { Camera } from '../models/dashboard.model';
import { Video } from '../video/video';
import { LayoutService } from '../utils/layout.service';

@Component({
  selector: 'app-protect',
  templateUrl: './protect.html',
  imports: [Video],
})
export class Protect {
  readonly layout = inject(LayoutService);

  readonly cameras: Camera[] = ['entry', 'garden', 'patio'];
  readonly pinned = signal<Camera>('entry');

  next() {
    const idx = this.cameras.indexOf(this.pinned());
    let next = idx + 1;
    if (next > this.cameras.length) {
      next = 0;
    }
    this.pinned.set(this.cameras[next]);
  }

  previous() {
    const idx = this.cameras.indexOf(this.pinned());
    let previous = idx - 1;
    if (previous < 0) {
      previous = this.cameras.length - 1;
    }
    this.pinned.set(this.cameras[previous]);
  }
}
