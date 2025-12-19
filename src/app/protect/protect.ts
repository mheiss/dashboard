import { Component, signal } from '@angular/core';
import { Camera } from '../models/dashboard.model';
import { Video } from '../video/video';

@Component({
  selector: 'app-protect',
  templateUrl: './protect.html',
  imports: [Video],
})
export class Protect {
  readonly cameras: Camera[] = ['entry', 'garden', 'patio'];

  readonly pinned = signal<Camera>('entry');
}
