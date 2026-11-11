import { DOCUMENT } from '@angular/common';
import { computed, effect, inject, Injectable, signal } from '@angular/core';

type Theme = 'dark' | 'light';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  readonly theme = signal<Theme>(this.readTheme());
  readonly isDark = computed(() => this.theme() === 'dark');

  constructor() {
    effect(() => {
      const theme = this.theme();
      this.document.documentElement.dataset['theme'] = theme;
      try {
        this.document.defaultView?.localStorage.setItem('dashboard.theme', theme);
      } catch {
        // The selected theme still applies for this session when storage is unavailable.
      }
    });
  }

  toggle() {
    this.theme.update((theme) => (theme === 'dark' ? 'light' : 'dark'));
  }

  private readTheme(): Theme {
    try {
      return this.document.defaultView?.localStorage.getItem('dashboard.theme') === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  }
}
