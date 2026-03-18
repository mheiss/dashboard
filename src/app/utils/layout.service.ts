import { BreakpointObserver } from '@angular/cdk/layout';
import { inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class LayoutService {
  private readonly breakpoints = inject(BreakpointObserver);

  readonly mobile$ = this.observe('(max-width: 639px)');
  readonly tablet$ = this.observe('(min-width: 640px) and (max-width: 1023px)');
  readonly desktop$ = this.observe('(min-width: 1024px)');
  readonly scrollbarSize = signal(this.measureScrollbar());

  private observe(query: string) {
    return toSignal(this.breakpoints.observe(query).pipe(map((r) => r.matches)), { requireSync: true });
  }

  private measureScrollbar() {
    const div = document.createElement('div');
    Object.assign(div.style, {
      width: '100px',
      height: '100px',
      overflow: 'scroll',
      position: 'absolute',
      top: '-9999px',
    });

    document.body.appendChild(div);
    const width = div.offsetWidth - div.clientWidth;
    document.body.removeChild(div);
    return width;
  }
}
