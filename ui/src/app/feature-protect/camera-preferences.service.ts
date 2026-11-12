import { DOCUMENT } from '@angular/common';
import { inject, Injectable, signal } from '@angular/core';
import { Camera } from './protect.model';

@Injectable({ providedIn: 'root' })
export class CameraPreferencesService {
  private readonly document = inject(DOCUMENT);
  readonly storageError = signal<string | null>(null);
  readonly hiddenCameras = signal<Camera[]>(this.readHiddenCameras());

  setVisible(camera: Camera, visible: boolean): void {
    const hidden = visible ? this.hiddenCameras().filter((id) => id !== camera) : [...new Set([...this.hiddenCameras(), camera])];
    this.hiddenCameras.set(hidden);
    try {
      const storage = this.document.defaultView?.localStorage;
      if (!storage) throw new Error('Local storage unavailable');
      storage.setItem('dashboard.hiddenCameras', JSON.stringify(hidden));
      this.storageError.set(null);
    } catch {
      this.storageError.set('Die Kameraauswahl konnte nicht gespeichert werden und gilt nur bis zum Neuladen.');
    }
  }

  private readHiddenCameras(): Camera[] {
    try {
      const storage = this.document.defaultView?.localStorage;
      if (!storage) throw new Error('Local storage unavailable');
      const stored = storage.getItem('dashboard.hiddenCameras');
      if (stored === null) return [];
      const value: unknown = JSON.parse(stored);
      if (!Array.isArray(value) || !value.every((camera) => typeof camera === 'string')) {
        throw new Error('Invalid camera selection');
      }
      return [...new Set<string>(value)];
    } catch {
      this.storageError.set('Die gespeicherte Kameraauswahl konnte nicht gelesen werden. Bitte überprüfe die Auswahl.');
      return [];
    }
  }
}
