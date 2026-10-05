import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { timeout } from 'rxjs';
import { DebugService } from '../utils/debug.service';
import { Camera } from './protect.model';

export interface MotionSnapshot {
  id: number;
  camera: Camera;
  timestamp: Date;
  url: string;
}

@Injectable({ providedIn: 'root' })
export class MotionService {
  private readonly http = inject(HttpClient);
  private readonly debug = inject(DebugService);
  private readonly images = signal<MotionSnapshot[]>([]);
  readonly snapshots = this.images.asReadonly();
  private nextId = 0;

  capture(camera: Camera): void {
    const id = this.nextId++;
    const timestamp = new Date();
    this.http
      .get('/api/webrtc/frame.jpeg', { params: { src: 'unifi_' + camera }, responseType: 'blob' })
      .pipe(timeout(10_000))
      .subscribe({
        next: (blob) => {
          const snapshot: MotionSnapshot = { id, camera, timestamp, url: URL.createObjectURL(blob) };
          this.images.update((images) => {
            const sorted = [snapshot, ...images].sort((first, second) => second.id - first.id);
            sorted.slice(20).forEach((image) => URL.revokeObjectURL(image.url));
            return sorted.slice(0, 20);
          });
        },
        error: (error) => this.debug.log(`Motion snapshot failed for '${camera}'.`, error),
      });
  }
}
