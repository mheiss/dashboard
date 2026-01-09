import { NgClass } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DefaultUrlSerializer, NavigationEnd, Router, RouterModule, UrlTree } from '@angular/router';
import { entries } from './navigation.model';

@Component({
  selector: 'app-navigation',
  templateUrl: './navigation.html',
  imports: [RouterModule, NgClass],
})
export class Navigation {
  readonly router = inject(Router);

  readonly elements = entries();
  readonly activePath = signal('');

  constructor() {
    const serializer = new DefaultUrlSerializer();
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.update(serializer.parse(event.url));
      }
    });

    effect(() => {
      for (const element of this.elements) {
        element.active.set(element.path === this.activePath());
        element.
      }
    });
  }

  update(tree: UrlTree) {
    const segments = tree.root.children['primary'].segments.map((s) => s.path);
    this.activePath.set(segments.length ? '/' + segments[0] : '');
  }
}
