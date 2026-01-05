import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { LayoutService } from '../utils/layout.service';
import { Video } from './video/video';
import { Camera, isCamera } from './protect.model';

@Component({
  selector: 'app-protect',
  templateUrl: './protect.html',
  imports: [Video],
})
export class Protect {
  readonly layout = inject(LayoutService);
  readonly activatedRoute = inject(ActivatedRoute);

  readonly cameras: Camera[] = ['entry', 'garden', 'patio'];
  readonly pinned = signal<Camera>('entry');

  constructor() {
    this.activatedRoute.queryParamMap.pipe(takeUntilDestroyed()).subscribe((map) => {
      const param = map.get('camera');
      if (isCamera(param)) {
        this.pinned.set(param);
      }
    });
  }

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
