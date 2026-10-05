import { NgClass } from '@angular/common';
import { Component, computed, effect, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DefaultUrlSerializer, NavigationEnd, Router, RouterModule, UrlTree } from '@angular/router';
import { entries } from './navigation.model';
import { LayoutService } from '../utils/layout.service';
import { LucideCalendarDays, LucideImages } from '@lucide/angular';

@Component({
  selector: 'app-navigation',
  templateUrl: './navigation.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [RouterModule, NgClass, LucideCalendarDays, LucideImages],
})
export class Navigation {
  readonly router = inject(Router);
  readonly layout = inject(LayoutService);

  private readonly allElements = entries();
  readonly elements = computed(() =>
    this.allElements.filter((entry) => this.layout.mobile$() ? entry.path !== '/home' : entry.path !== '/calendar' && entry.path !== '/gallery'),
  );
  readonly activePath = signal('');
  readonly highlightedPath = computed(() => {
    const path = this.activePath();
    if (['/home', '/calendar', '/gallery'].includes(path)) {
      return this.layout.mobile$() ? (path === '/gallery' ? '/gallery' : '/calendar') : '/home';
    }
    return path;
  });

  constructor() {
    const serializer = new DefaultUrlSerializer();
    this.update(serializer.parse(this.router.url));
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.update(serializer.parse(event.url));
      }
    });

    effect(() => {
      for (const element of this.allElements) {
        element.active.set(element.path === this.highlightedPath());
      }
    });
  }

  update(tree: UrlTree) {
    const primary = tree.root.children['primary'];
    const segments = primary?.segments.map((s) => s.path);
    this.activePath.set(segments?.length ? '/' + segments[0] : '');
  }
}
