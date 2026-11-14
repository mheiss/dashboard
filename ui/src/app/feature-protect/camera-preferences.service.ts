import { DOCUMENT } from '@angular/common';
import { inject, Injectable, signal } from '@angular/core';
import { Camera } from './protect.model';

@Injectable({ providedIn: 'root' })
export class CameraPreferencesService {
  private readonly document = inject(DOCUMENT);
  readonly storageError = signal<string | null>(null);
  readonly hiddenCameras = signal<Camera[]>(this.readHiddenCameras());
  readonly cameraOrder = signal<Camera[]>(this.readCameraOrder());

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

  orderedCameras(cameras: readonly Camera[]): Camera[] {
    const stored = this.cameraOrder();
    return [...stored.filter((camera) => cameras.includes(camera)), ...cameras.filter((camera) => !stored.includes(camera))];
  }

  moveCamera(camera: Camera, direction: -1 | 1, cameras: readonly Camera[]): void {
    const ordered = this.orderedCameras(cameras);
    const index = ordered.indexOf(camera);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;

    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    this.cameraOrder.set(ordered);
    try {
      const storage = this.document.defaultView?.localStorage;
      if (!storage) throw new Error('Local storage unavailable');
      storage.setItem('dashboard.cameraOrder', JSON.stringify(ordered));
      this.storageError.set(null);
    } catch {
      this.storageError.set('Die Kamerareihenfolge konnte nicht gespeichert werden und gilt nur bis zum Neuladen.');
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

  private readCameraOrder(): Camera[] {
    try {
      const storage = this.document.defaultView?.localStorage;
      if (!storage) throw new Error('Local storage unavailable');
      const stored = storage.getItem('dashboard.cameraOrder');
      if (stored === null) return [];
      const value: unknown = JSON.parse(stored);
      if (!Array.isArray(value) || !value.every((camera) => typeof camera === 'string')) {
        throw new Error('Invalid camera order');
      }
      return [...new Set<string>(value)];
    } catch {
      this.storageError.set('Die gespeicherte Kamerareihenfolge konnte nicht gelesen werden.');
      return [];
    }
  }
}
